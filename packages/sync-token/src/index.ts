/**
 * Short-lived tokens that let the sync server trust a browser's identity without calling the web
 * app. The web app signs them (GET /api/sync-token); the sync server verifies them in
 * `onAuthenticate`. HS256 with a secret shared by both services (SYNC_JWT_SECRET).
 */
import {
  SYNC_TOKEN_AUDIENCE,
  SYNC_TOKEN_ISSUER,
  SYNC_TOKEN_TTL_SECONDS,
  syncIdentitySchema,
  type SyncIdentity,
} from "@pc/schema";
import { errors, jwtVerify, SignJWT } from "jose";

const ALGORITHM = "HS256";
const MIN_SECRET_LENGTH = 32;

export type SyncTokenFailure = "expired" | "invalid" | "malformed";

export class SyncTokenError extends Error {
  constructor(
    readonly reason: SyncTokenFailure,
    message: string,
  ) {
    super(message);
    this.name = "SyncTokenError";
  }
}

function key(secret: string): Uint8Array {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`SYNC_JWT_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export interface SignOptions {
  ttlSeconds?: number;
  /** Seconds since epoch; for tests. */
  now?: number;
}

export async function signSyncToken(
  identity: SyncIdentity,
  secret: string,
  { ttlSeconds = SYNC_TOKEN_TTL_SECONDS, now = Math.floor(Date.now() / 1000) }: SignOptions = {},
): Promise<{ token: string; expiresAt: Date }> {
  const { userId, ...claims } = syncIdentitySchema.parse(identity);
  const exp = now + ttlSeconds;
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(userId)
    .setIssuer(SYNC_TOKEN_ISSUER)
    .setAudience(SYNC_TOKEN_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(exp)
    .sign(key(secret));
  return { token, expiresAt: new Date(exp * 1000) };
}

export interface VerifyOptions {
  /** Seconds since epoch; for tests. */
  now?: number;
}

/** Returns the identity in a valid token, or throws SyncTokenError. */
export async function verifySyncToken(
  token: string,
  secret: string,
  { now }: VerifyOptions = {},
): Promise<SyncIdentity> {
  let payload: Record<string, unknown>;
  try {
    ({ payload } = await jwtVerify(token, key(secret), {
      algorithms: [ALGORITHM],
      issuer: SYNC_TOKEN_ISSUER,
      audience: SYNC_TOKEN_AUDIENCE,
      requiredClaims: ["sub", "exp", "iat"],
      ...(now === undefined ? {} : { currentDate: new Date(now * 1000) }),
    }));
  } catch (error) {
    if (error instanceof errors.JWTExpired) {
      throw new SyncTokenError("expired", "sync token expired");
    }
    throw new SyncTokenError("invalid", "sync token is not valid");
  }

  const parsed = syncIdentitySchema.safeParse({
    userId: payload.sub,
    name: payload.name,
    avatar: payload.avatar,
    color: payload.color,
  });
  if (!parsed.success) {
    throw new SyncTokenError("malformed", "sync token claims are malformed");
  }
  return parsed.data;
}
