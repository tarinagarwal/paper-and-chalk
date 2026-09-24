import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { signSyncToken, SyncTokenError, verifySyncToken } from "./index";

const secret = "a".repeat(40);
const identity = {
  userId: "user_123",
  name: "Maya",
  avatar: "https://example.com/maya.png",
  color: "#3f7d4e",
};
const now = 1_790_000_000;

async function expectFailure(promise: Promise<unknown>, reason: string) {
  const error: unknown = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(SyncTokenError);
  expect((error as SyncTokenError).reason).toBe(reason);
}

describe("sync tokens", () => {
  it("round-trips an identity", async () => {
    const { token, expiresAt } = await signSyncToken(identity, secret, { now });
    expect(expiresAt.getTime()).toBe((now + 600) * 1000);
    await expect(verifySyncToken(token, secret, { now: now + 60 })).resolves.toEqual(identity);
  });

  it("accepts a user without an avatar", async () => {
    const { token } = await signSyncToken({ ...identity, avatar: null }, secret, { now });
    await expect(verifySyncToken(token, secret, { now })).resolves.toMatchObject({
      avatar: null,
    });
  });

  it("expires after 10 minutes", async () => {
    const { token } = await signSyncToken(identity, secret, { now });
    await expectFailure(verifySyncToken(token, secret, { now: now + 601 }), "expired");
  });

  it("rejects a token signed with another secret", async () => {
    const { token } = await signSyncToken(identity, "b".repeat(40), { now });
    await expectFailure(verifySyncToken(token, secret, { now }), "invalid");
  });

  it("rejects a tampered token", async () => {
    const { token } = await signSyncToken(identity, secret, { now });
    const [header, payload, signature] = token.split(".");
    const forged = JSON.parse(Buffer.from(payload ?? "", "base64url").toString()) as object;
    const tampered = Buffer.from(JSON.stringify({ ...forged, sub: "admin" })).toString("base64url");
    await expectFailure(
      verifySyncToken(`${header ?? ""}.${tampered}.${signature ?? ""}`, secret, { now }),
      "invalid",
    );
  });

  it("rejects garbage", async () => {
    await expectFailure(verifySyncToken("not-a-token", secret, { now }), "invalid");
  });

  it("rejects the wrong audience or issuer", async () => {
    const key = new TextEncoder().encode(secret);
    const base = new SignJWT({ name: "Maya", avatar: null, color: "#3f7d4e" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuedAt(now)
      .setExpirationTime(now + 600);
    const wrongAudience = await base
      .setIssuer("paper-chalk-web")
      .setAudience("someone-else")
      .sign(key);
    await expectFailure(verifySyncToken(wrongAudience, secret, { now }), "invalid");
  });

  it("rejects tokens with malformed identity claims", async () => {
    const key = new TextEncoder().encode(secret);
    const bad = await new SignJWT({ name: "Maya", avatar: null, color: "green" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("user_123")
      .setIssuer("paper-chalk-web")
      .setAudience("paper-chalk-sync")
      .setIssuedAt(now)
      .setExpirationTime(now + 600)
      .sign(key);
    await expectFailure(verifySyncToken(bad, secret, { now }), "malformed");
  });

  it("refuses a short secret", async () => {
    await expect(signSyncToken(identity, "short")).rejects.toThrow(/at least 32/);
  });
});
