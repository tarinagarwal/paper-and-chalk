import { describe, expect, it } from "vitest";

import { isJobKind, jobMessageSchema, jobPayloadSchemas } from "./jobs";

describe("jobs", () => {
  it("recognises known job kinds only", () => {
    expect(isJobKind("ping")).toBe(true);
    expect(isJobKind("nope")).toBe(false);
    expect(isJobKind("toString")).toBe(false);
  });

  it("parses a ping payload", () => {
    expect(jobPayloadSchemas.ping.parse({ message: "hi" })).toEqual({ message: "hi" });
  });

  it("rejects an empty or extra-field ping payload", () => {
    expect(jobPayloadSchemas.ping.safeParse({ message: "" }).success).toBe(false);
    expect(jobPayloadSchemas.ping.safeParse({ message: "hi", extra: 1 }).success).toBe(false);
  });

  it("parses the scheduled trash purge, which has no job record", () => {
    expect(jobPayloadSchemas.purgeTrash.parse({})).toEqual({});
    expect(jobPayloadSchemas.purgeTrash.safeParse({ retentionDays: 0 }).success).toBe(false);
    expect(jobMessageSchema.parse({ jobId: null, kind: "purgeTrash", payload: {} })).toMatchObject({
      jobId: null,
      kind: "purgeTrash",
    });
  });
});
