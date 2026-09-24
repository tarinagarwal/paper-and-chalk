/**
 * AWS credentials without stored keys, for services running on Google Cloud (Cloud Run): the
 * service account's Google ID token is exchanged for an AWS role session (STS web identity).
 *
 * Sessions last 12 hours and are renewed 2 hours before they end. Presigned URLs stop working
 * when the credentials that signed them expire, so renewing early keeps every URL we hand out
 * (at most an hour for uploads) valid for its whole life.
 */
import { AssumeRoleWithWebIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from "@aws-sdk/types";

const METADATA_IDENTITY =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity";
const SESSION_SECONDS = 12 * 60 * 60;
const RENEW_BEFORE_MS = 2 * 60 * 60 * 1000;

export interface WebIdentityOptions {
  roleArn: string;
  /** The audience the ID token is minted for; the AWS role trusts only this value. */
  audience: string;
  region: string;
  /** Overridable for tests: returns a Google-signed ID token. */
  fetchIdToken?: (audience: string) => Promise<string>;
  /** Overridable for tests: exchanges the token for credentials. */
  assumeRole?: (token: string) => Promise<AwsCredentialIdentity>;
  now?: () => number;
}

/** Asks the Cloud Run / GCE metadata server for an ID token for the running service account. */
async function metadataIdToken(audience: string): Promise<string> {
  const url = `${METADATA_IDENTITY}?audience=${encodeURIComponent(audience)}&format=full`;
  const response = await fetch(url, { headers: { "Metadata-Flavor": "Google" } });
  if (!response.ok) {
    throw new Error(`metadata server refused an ID token (${String(response.status)})`);
  }
  return response.text();
}

export function googleWebIdentityCredentials(
  options: WebIdentityOptions,
): AwsCredentialIdentityProvider {
  const now = options.now ?? Date.now;
  const fetchIdToken = options.fetchIdToken ?? metadataIdToken;
  const sts = new STSClient({ region: options.region });
  const assumeRole =
    options.assumeRole ??
    (async (token: string): Promise<AwsCredentialIdentity> => {
      const { Credentials: c } = await sts.send(
        new AssumeRoleWithWebIdentityCommand({
          RoleArn: options.roleArn,
          RoleSessionName: "paper-chalk",
          WebIdentityToken: token,
          DurationSeconds: SESSION_SECONDS,
        }),
      );
      if (!c?.AccessKeyId || !c.SecretAccessKey || !c.SessionToken || !c.Expiration) {
        throw new Error("STS returned no credentials");
      }
      return {
        accessKeyId: c.AccessKeyId,
        secretAccessKey: c.SecretAccessKey,
        sessionToken: c.SessionToken,
        expiration: c.Expiration,
      };
    });

  let current: AwsCredentialIdentity | null = null;
  let renewing: Promise<AwsCredentialIdentity> | null = null;

  const fresh = (c: AwsCredentialIdentity | null) =>
    c !== null && (c.expiration?.getTime() ?? 0) - now() > RENEW_BEFORE_MS;

  return async () => {
    if (current && fresh(current)) return current;
    // One exchange at a time, however many requests are waiting.
    renewing ??= (async () => {
      try {
        current = await assumeRole(await fetchIdToken(options.audience));
        return current;
      } finally {
        renewing = null;
      }
    })();
    return renewing;
  };
}

/**
 * Credentials for our AWS clients, from the environment:
 * - AWS_WEB_IDENTITY_ROLE_ARN (+ AWS_WEB_IDENTITY_AUDIENCE): keyless, on Google Cloud;
 * - S3_ACCESS_KEY_ID + S3_SECRET_ACCESS_KEY: the dev IAM user;
 * - neither: the AWS default chain (a Lambda role, CI's OIDC role, the CLI profile).
 */
export function awsCredentialsFromEnv(env: {
  AWS_WEB_IDENTITY_ROLE_ARN?: string | undefined;
  AWS_WEB_IDENTITY_AUDIENCE?: string | undefined;
  S3_ACCESS_KEY_ID?: string | undefined;
  S3_SECRET_ACCESS_KEY?: string | undefined;
  S3_REGION?: string | undefined;
}): AwsCredentialIdentity | AwsCredentialIdentityProvider | undefined {
  if (env.AWS_WEB_IDENTITY_ROLE_ARN) {
    return googleWebIdentityCredentials({
      roleArn: env.AWS_WEB_IDENTITY_ROLE_ARN,
      audience: env.AWS_WEB_IDENTITY_AUDIENCE ?? "paper-chalk-aws",
      region: env.S3_REGION ?? "ap-south-1",
    });
  }
  if (env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY) {
    return { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY };
  }
  return undefined;
}
