import { describe, expect, it, vi } from "vitest";

import { runHealthChecks } from "./health";

const up = () => Promise.resolve();
const down = () => Promise.reject(new Error("down"));
const hang = () => new Promise<void>(() => undefined);

describe("runHealthChecks", () => {
  it("reports ok when every probe passes", async () => {
    await expect(runHealthChecks({ db: up, redis: up, storage: up })).resolves.toEqual({
      ok: true,
      db: true,
      redis: true,
      storage: true,
    });
  });

  it("reports the failing service and ok=false", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(runHealthChecks({ db: up, redis: down, storage: up })).resolves.toEqual({
      ok: false,
      db: true,
      redis: false,
      storage: true,
    });
    spy.mockRestore();
  });

  it("treats a hung probe as down after the timeout", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const report = await runHealthChecks({ db: hang, redis: up, storage: up }, 20);
    expect(report).toEqual({ ok: false, db: false, redis: true, storage: true });
    spy.mockRestore();
  });
});
