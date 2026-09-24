/**
 * Smoke test for a deployed environment (the deploy workflow runs it after every deploy):
 * - web /api/health is ok (db, redis, storage) and reports the release that was just deployed;
 * - sync /health reports that release too;
 * - two clients with freshly signed sync tokens connect over wss and sync a document, and a bad
 *   token is refused.
 *
 *   WEB_URL=https://… SYNC_URL=wss://… SYNC_JWT_SECRET=… EXPECTED_RELEASE=<sha> pnpm --filter @pc/sync smoke
 */
import { HocuspocusProvider } from "@hocuspocus/provider";
import { presenceColor } from "@pc/schema";
import { signSyncToken } from "@pc/sync-token";
import * as Y from "yjs";

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
};

const webUrl = required("WEB_URL");
const syncUrl = required("SYNC_URL");
const secret = required("SYNC_JWT_SECRET");
const release = required("EXPECTED_RELEASE");

function step(message: string) {
  console.info(`→ ${message}`);
}

/** Polls until `check` passes: new revisions can take a moment to take traffic (cold starts). */
async function eventually(what: string, check: () => Promise<string | null>, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const problem = await check();
      if (problem === null) return;
      last = problem;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  throw new Error(`${what}: ${last}`);
}

async function json(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  return (await response.json()) as Record<string, unknown>;
}

function connect(token: string, name: string, document: Y.Doc) {
  return new Promise<{ provider: HocuspocusProvider; ok: boolean }>((resolve) => {
    const provider: HocuspocusProvider = new HocuspocusProvider({
      url: syncUrl,
      name,
      document,
      token,
      onAuthenticated: () => {
        resolve({ provider, ok: true });
      },
      onAuthenticationFailed: () => {
        resolve({ provider, ok: false });
      },
    });
  });
}

async function syncOverWss() {
  const identity = (userId: string) => ({
    userId,
    name: "Smoke test",
    avatar: null,
    color: presenceColor(userId),
  });
  const docName = `smoke:${release}:${String(Date.now())}`;
  const a = await connect(
    (await signSyncToken(identity("smoke-a"), secret)).token,
    docName,
    new Y.Doc(),
  );
  const b = await connect(
    (await signSyncToken(identity("smoke-b"), secret)).token,
    docName,
    new Y.Doc(),
  );
  try {
    if (!a.ok || !b.ok) throw new Error("a signed token was refused");
    const text = `hello from ${release}`;
    a.provider.document.getText("smoke").insert(0, text);
    await eventually(
      "the second client never saw the first client's edit",
      () =>
        Promise.resolve(b.provider.document.getText("smoke").toJSON() === text ? null : "waiting"),
      30_000,
    );
    const bad = await connect("not-a-token", docName, new Y.Doc());
    bad.provider.destroy();
    if (bad.ok) throw new Error("a bad token was accepted");
  } finally {
    a.provider.destroy();
    b.provider.destroy();
  }
}

step(`web ${webUrl}/api/health reports release ${release} and everything up`);
await eventually("web health", async () => {
  const health = await json(`${webUrl}/api/health`);
  if (health.release !== release) return `release is ${String(health.release)}`;
  return health.ok === true ? null : `unhealthy: ${JSON.stringify(health)}`;
});

const syncHttp = syncUrl.replace(/^ws/, "http");
step(`sync ${syncHttp}/health reports release ${release}`);
await eventually("sync health", async () => {
  const health = await json(`${syncHttp}/health`);
  return health.release === release ? null : `release is ${String(health.release)}`;
});

step("two clients sync a document over wss with signed tokens; a bad token is refused");
await syncOverWss();

console.info("✔ smoke test passed");
process.exit(0);
