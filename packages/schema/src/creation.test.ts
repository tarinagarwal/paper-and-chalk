import { describe, expect, it } from "vitest";

import {
  importUrlSchema,
  newDocumentSchema,
  paperPageSpec,
  SYSTEM_TEMPLATES,
  systemTemplate,
} from "./creation";
import { imagePageSize, pageSpecSchema } from "./page";

const WS = "0196b3a0-0000-7000-8000-000000000001";
const ASSET = "0196b3a0-0000-7000-8000-0000000000a1";

describe("new documents", () => {
  it("accepts a notebook on paper and refuses one on an image", () => {
    const spec = paperPageSpec("a4", "portrait", "dotGrid");
    const ok = newDocumentSchema.parse({
      kind: "notebook",
      workspaceId: WS,
      title: "Notes",
      pageSpec: spec,
      pageCount: 5,
    });
    expect(ok).toMatchObject({ folderId: null, cover: null, pageCount: 5 });
    const image = {
      ...spec,
      background: { kind: "image", assetId: ASSET, fit: "fill", paperColor: "#ffffff" },
    };
    expect(
      newDocumentSchema.safeParse({
        kind: "notebook",
        workspaceId: WS,
        title: "Notes",
        pageSpec: image,
        pageCount: 1,
      }).success,
    ).toBe(false);
    expect(
      newDocumentSchema.safeParse({
        kind: "notebook",
        workspaceId: WS,
        title: "Too long",
        pageSpec: spec,
        pageCount: 501,
      }).success,
    ).toBe(false);
  });

  it("defaults imported images to pages sized like the image", () => {
    const parsed = newDocumentSchema.parse({
      kind: "import",
      workspaceId: WS,
      title: "Scans",
      items: [{ assetId: ASSET, widthPx: 1200, heightPx: 1600 }],
    });
    expect(parsed).toMatchObject({ imageFit: { mode: "image" } });
    expect(imagePageSize(1200, 1600)).toEqual({ widthPt: 900, heightPt: 1200 });
    // Huge images are scaled down to the largest page allowed.
    expect(imagePageSize(40_000, 20_000).widthPt).toBe(14_400);
  });

  it("ships system templates that are all valid page specs", () => {
    expect(new Set(SYSTEM_TEMPLATES.map((t) => t.id)).size).toBe(SYSTEM_TEMPLATES.length);
    for (const template of SYSTEM_TEMPLATES) {
      if (template.type === "notebook") {
        expect(pageSpecSchema.safeParse(template.pageSpec).success, template.id).toBe(true);
        expect(template.pageCount).toBeGreaterThan(0);
      } else {
        expect(template.canvasBackground).not.toBeNull();
      }
    }
    expect(systemTemplate("lecture-notes")?.pageSpec?.background).toMatchObject({
      template: "cornell",
    });
    expect(systemTemplate("nope")).toBeNull();
  });

  it("imports only from https addresses", () => {
    expect(
      importUrlSchema.safeParse({ workspaceId: WS, url: "https://example.com/a.pdf" }).success,
    ).toBe(true);
    expect(
      importUrlSchema.safeParse({ workspaceId: WS, url: "http://example.com/a.pdf" }).success,
    ).toBe(false);
    expect(importUrlSchema.safeParse({ workspaceId: WS, url: "file:///etc/passwd" }).success).toBe(
      false,
    );
  });
});
