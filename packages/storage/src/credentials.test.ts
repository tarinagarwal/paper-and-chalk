import { describe, expect, it } from "vitest";

import { awsCredentialsFromEnv, googleWebIdentityCredentials } from "./credentials";

const HOUR = 3_600_000;

function harness() {
  let clock = 0;
  let exchanges = 0;
  const provider = googleWebIdentityCredentials({
    roleArn: "arn:aws:iam::1:role/web",
    audience: "paper-chalk-aws",
    region: "ap-south-1",
    now: () => clock,
    fetchIdToken: (audience) => Promise.resolve(`token-for-${audience}`),
    assumeRole: (token) => {
      exchanges++;
      return Promise.resolve({
        accessKeyId: `key-${String(exchanges)}`,
        secretAccessKey: "secret",
        sessionToken: token,
        expiration: new Date(clock + 12 * HOUR),
      });
    },
  });
  return {
    provider,
    advance: (ms: number) => {
      clock += ms;
    },
    exchanges: () => exchanges,
  };
}

describe("googleWebIdentityCredentials", () => {
  it("exchanges a Google ID token for the audience it was minted for", async () => {
    const { provider } = harness();
    expect(await provider()).toMatchObject({ sessionToken: "token-for-paper-chalk-aws" });
  });

  it("reuses a session and renews it two hours before it ends", async () => {
    const { provider, advance, exchanges } = harness();
    await provider();
    advance(9 * HOUR);
    expect((await provider()).accessKeyId).toBe("key-1");
    advance(1.5 * HOUR);
    expect((await provider()).accessKeyId).toBe("key-2");
    expect(exchanges()).toBe(2);
  });

  it("exchanges once for many simultaneous callers", async () => {
    const { provider, exchanges } = harness();
    await Promise.all([provider(), provider(), provider()]);
    expect(exchanges()).toBe(1);
  });
});

describe("awsCredentialsFromEnv", () => {
  it("prefers keyless web identity, then static keys, then the default chain", () => {
    expect(
      typeof awsCredentialsFromEnv({ AWS_WEB_IDENTITY_ROLE_ARN: "arn:aws:iam::1:role/web" }),
    ).toBe("function");
    expect(awsCredentialsFromEnv({ S3_ACCESS_KEY_ID: "a", S3_SECRET_ACCESS_KEY: "b" })).toEqual({
      accessKeyId: "a",
      secretAccessKey: "b",
    });
    expect(awsCredentialsFromEnv({})).toBeUndefined();
  });
});
