import { createHash } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { PAPER_TEMPLATES } from "@pc/schema";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";
import { pdf, png } from "./files";
import {
  card,
  openWorkspace,
  personalWorkspaceId,
  seedWorkspace,
  storedDocument,
} from "./library-helpers";

/**
 * The New dialog (SPEC.md section 6) end to end: notebooks, boards, imports (real S3 under
 * test/e2e/, verified by the local workers) and templates, each checked on /app/d/[id], where
 * pages are drawn by the same paper engine as the dialog's previews.
 */

test.use({ storageState: AUTH_STATE });

const unique = (label: string) =>
  `${label} ${String(Date.now() % 1_000_000)}${String(Math.floor(Math.random() * 100))}`;

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

async function emptyWorkspace(label: string) {
  return (await seedWorkspace(unique(label), { docs: [] })).workspaceId;
}

async function openNew(page: Page, tab?: "Infinite canvas" | "Import" | "Templates") {
  await page.getByTestId("new-document").filter({ visible: true }).click();
  const dialog = page.getByTestId("new-document-dialog");
  await expect(dialog).toBeVisible();
  if (tab) await dialog.getByRole("tab", { name: tab }).click();
  return dialog;
}

const hashOf = (locator: Locator) => locator.getAttribute("data-commands-hash");

const pages = (page: Page) => page.getByTestId("document-page").filter({ visible: true });

/** Waits for the document page, then checks every page against the dialog's preview. */
async function expectPages(page: Page, count: number, previewHash: string | null) {
  await page.waitForURL(/\/app\/d\/[0-9a-f-]{36}$/);
  await expect(pages(page)).toHaveCount(count);
  if (previewHash) {
    for (const hash of await pages(page).evaluateAll((all) =>
      all.map((c) => c.getAttribute("data-commands-hash")),
    )) {
      expect(hash).toBe(previewHash);
    }
  }
}

/** The on-screen proportions of the first page, and the size it says it is. */
async function firstPageShape(page: Page) {
  const first = pages(page).first();
  const box = await first.boundingBox();
  if (!box) throw new Error("the first page is not on screen");
  return {
    ratio: box.width / box.height,
    widthPt: Number(await first.getAttribute("data-width-pt")),
    heightPt: Number(await first.getAttribute("data-height-pt")),
  };
}

const MM = 72 / 25.4;

/**
 * The most common colour in a small patch of the first page (at fractions of its size), once it
 * has been drawn: the paper, not a line that happens to cross the patch.
 */
async function colourAt(page: Page, x: number, y: number) {
  const first = pages(page).first();
  let rgb: number[] = [];
  await expect
    .poll(async () => {
      rgb = await first.evaluate(
        (canvas: HTMLCanvasElement, [fx, fy]) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return [];
          const size = 12;
          const left = Math.min(canvas.width - size, Math.floor(fx * canvas.width));
          const top = Math.min(canvas.height - size, Math.floor(fy * canvas.height));
          const data = ctx.getImageData(left, top, size, size).data;
          const counts = new Map<string, number>();
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] !== 255) return [];
            const key = `${String(data[i])},${String(data[i + 1])},${String(data[i + 2])}`;
            counts.set(key, (counts.get(key) ?? 0) + 1);
          }
          const [top1] = [...counts].sort((a, b) => b[1] - a[1]);
          return top1 ? top1[0].split(",").map(Number) : [];
        },
        [x, y] as const,
      );
      return rgb.length;
    })
    .toBe(3);
  return rgb;
}

const near = (actual: number[], expected: number[], tolerance = 6) =>
  actual.every((v, i) => Math.abs(v - (expected[i] ?? 0)) <= tolerance);

test.describe("new notebooks", () => {
  test("an A4 portrait dot-grid notebook with 5 pages", async ({ page }) => {
    await openWorkspace(page, await emptyWorkspace("Dots"));
    const dialog = await openNew(page);
    const title = unique("Dot notes");
    await dialog.locator("#notebook-title").fill(title);
    await dialog.getByTestId("template-picker").locator('[data-template="dotGrid"]').click();
    await dialog.locator("#page-count").fill("5");
    await expect(dialog.getByTestId("preview-size")).toHaveText("210 × 297 mm · 5 pages");
    const preview = await hashOf(dialog.getByTestId("paper-preview"));
    await dialog.getByTestId("create-notebook").click();

    await expectPages(page, 5, preview);
    await expect(page.getByRole("heading", { name: title, level: 1 })).toBeVisible();
    await expect(page.getByTestId("document-meta")).toHaveText(/Notebook · 5 pages/i);
    await expect(page.getByText("Page 5 · A4 · 210 × 297 mm")).toBeVisible();
    const shape = await firstPageShape(page);
    expect(shape.ratio).toBeCloseTo(210 / 297, 2);
    expect(shape.widthPt).toBeCloseTo(210 * MM, 1);

    const id = page.url().split("/").pop() ?? "";
    const stored = await storedDocument(id);
    expect(stored.document).toMatchObject({ type: "notebook", pageCount: 5, title });
    expect(stored.meta).toBe(1);
  });

  test("A3 landscape, B5, US Letter and a custom 100 × 150 mm keep their proportions", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const workspaceId = await emptyWorkspace("Sizes");
    const cases: {
      size: string;
      landscape?: boolean;
      custom?: [string, string];
      label: string;
      mm: [number, number];
    }[] = [
      { size: "a3", landscape: true, label: "A3 · 420 × 297 mm", mm: [420, 297] },
      { size: "b5", label: "B5 · 176 × 250 mm", mm: [176, 250] },
      { size: "letter", label: "US Letter · 8.5 × 11 in", mm: [215.9, 279.4] },
      { size: "custom", custom: ["100", "150"], label: "100 × 150 mm", mm: [100, 150] },
    ];
    for (const c of cases) {
      await openWorkspace(page, workspaceId);
      const dialog = await openNew(page);
      await dialog.locator("#notebook-size").selectOption(c.size);
      if (c.custom) {
        await dialog.locator("#custom-width").fill(c.custom[0]);
        await dialog.locator("#custom-height").fill(c.custom[1]);
      }
      if (c.landscape) await dialog.getByRole("radio", { name: "Landscape" }).click();
      const preview = await hashOf(dialog.getByTestId("paper-preview"));
      await dialog.getByTestId("create-notebook").click();

      await expectPages(page, 1, preview);
      await expect(page.getByText(`Page 1 · ${c.label}`)).toBeVisible();
      const shape = await firstPageShape(page);
      expect(shape.ratio, c.size).toBeCloseTo(c.mm[0] / c.mm[1], 2);
      expect(shape.widthPt, c.size).toBeCloseTo(c.mm[0] * MM, 0);
      expect(shape.heightPt, c.size).toBeCloseTo(c.mm[1] * MM, 0);
    }
  });

  test("dark paper with grey lines: the preview and the page match", async ({ page }) => {
    await openWorkspace(page, await emptyWorkspace("Dark"));
    const dialog = await openNew(page);
    await dialog.getByTestId("template-picker").locator('[data-template="grid"]').click();
    await dialog.getByRole("button", { name: "Use dark paper" }).click();
    await dialog.getByRole("group", { name: "Line colour" }).getByTitle("Grey").click();
    const preview = await hashOf(dialog.getByTestId("paper-preview"));
    await dialog.getByTestId("create-notebook").click();

    await expectPages(page, 1, preview);
    // The paper itself is the dark paper colour, #1f2124.
    expect(near(await colourAt(page, 0.02, 0.02), [0x1f, 0x21, 0x24])).toBe(true);
  });

  // Every template, in three groups so they spread over the workers.
  const groups = [0, 1, 2].map((g) => PAPER_TEMPLATES.filter((_, i) => i % 3 === g));
  for (const [g, templates] of groups.entries()) {
    test(`templates ${String(g + 1)}/3 render in the preview and match the created page`, async ({
      page,
    }) => {
      test.setTimeout(150_000);
      const workspaceId = await emptyWorkspace(`Templates ${String(g + 1)}`);
      for (const template of templates) {
        await openWorkspace(page, workspaceId);
        const dialog = await openNew(page);
        await dialog
          .getByTestId("template-picker")
          .locator(`[data-template="${template}"]`)
          .click();
        const preview = await hashOf(dialog.getByTestId("paper-preview"));
        expect(preview, template).toMatch(/^[0-9a-f]{8}$/);
        await dialog.getByTestId("create-notebook").click();
        await expectPages(page, 1, preview);
      }
    });
  }
});

test.describe("boards and templates", () => {
  test("an infinite canvas keeps its background", async ({ page }) => {
    await openWorkspace(page, await emptyWorkspace("Board"));
    const dialog = await openNew(page, "Infinite canvas");
    await dialog.getByRole("radio", { name: "Grid" }).click();
    await dialog.getByTestId("create-canvas").click();
    await page.waitForURL(/\/app\/d\//);
    await expect(page.getByTestId("document-meta")).toHaveText("Board");
    await expect(page.getByTestId("canvas-preview")).toBeVisible();
    const stored = await storedDocument(page.url().split("/").pop() ?? "");
    expect(stored.document.canvasBackground).toMatchObject({ pattern: "grid" });
  });

  test("save a notebook as a template, then create from My templates", async ({ page }) => {
    test.setTimeout(90_000);
    const workspaceId = await emptyWorkspace("Template");
    await openWorkspace(page, workspaceId);
    let dialog = await openNew(page);
    const title = unique("Cornell source");
    await dialog.locator("#notebook-title").fill(title);
    await dialog.locator("#notebook-size").selectOption("a5");
    await dialog.getByTestId("template-picker").locator('[data-template="cornell"]').click();
    await dialog.locator("#page-count").fill("3");
    const preview = await hashOf(dialog.getByTestId("paper-preview"));
    await dialog.getByTestId("create-notebook").click();
    await expectPages(page, 3, preview);

    await openWorkspace(page, workspaceId);
    await card(page, title).click({ button: "right" });
    await page.getByRole("menuitem", { name: "Save as template…" }).click();
    const save = page.getByTestId("save-template-dialog");
    const name = unique("My Cornell");
    await save.getByLabel("Name").fill(name);
    await save.getByRole("button", { name: "Save template" }).click();
    await expect(page.getByText(`Saved “${name}” to My templates`)).toBeVisible();
    // The right click selected the card; the toolbar (and its New button) returns once cleared.
    await page.getByRole("button", { name: "Clear selection" }).click();

    dialog = await openNew(page, "Templates");
    const mine = dialog.getByTestId("my-templates");
    await mine.getByRole("radio", { name: new RegExp(name) }).click();
    await expect(dialog.locator("#template-title")).toHaveValue(name);
    await dialog.getByTestId("create-from-template").click();
    await expectPages(page, 3, preview);
    await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();

    // And it can be deleted again.
    await openWorkspace(page, workspaceId);
    dialog = await openNew(page, "Templates");
    await dialog.getByRole("button", { name: `Delete the template ${name}` }).click();
    await expect(page.getByText(`Deleted the template “${name}”`)).toBeVisible();
    await expect(dialog.getByRole("radio", { name: new RegExp(name) })).toHaveCount(0);
  });

  test("system templates create their documents", async ({ page }) => {
    await openWorkspace(page, await emptyWorkspace("System"));
    const dialog = await openNew(page, "Templates");
    await dialog
      .getByTestId("system-templates")
      .getByRole("radio", { name: /Weekly planner/ })
      .click();
    await dialog.getByTestId("create-from-template").click();
    await expectPages(page, 4, null);
    await expect(page.getByText("Page 1 · A4 · 210 × 297 mm")).toBeVisible();
  });
});

test.describe("imports", () => {
  test.setTimeout(120_000);

  test("uploads files to S3 and creates the document, in the chosen order", async ({ page }) => {
    const workspaceId = await emptyWorkspace("Import");
    await openWorkspace(page, workspaceId);
    const dialog = await openNew(page, "Import");
    const image = png(300, 200, [200, 30, 30]);
    const paper = pdf();
    await dialog.getByTestId("import-input").setInputFiles([
      { name: "photo.png", mimeType: "image/png", buffer: image },
      { name: "notes.pdf", mimeType: "application/pdf", buffer: paper },
    ]);
    const items = dialog.getByTestId("import-item");
    await expect(items).toHaveCount(2);
    await expect(items.and(page.locator("[data-status=ready]"))).toHaveCount(2, {
      timeout: 60_000,
    });
    await dialog.getByRole("button", { name: "Move notes.pdf up" }).click();
    await expect(items.first()).toContainText("notes.pdf");
    await expect(dialog.locator("#import-title")).toHaveValue("notes");
    await dialog.getByTestId("create-import").click();

    // The image is a page now; the PDF's pages come once it is processed.
    await expectPages(page, 1, null);
    await expect(page.getByTestId("pdf-pending")).toContainText("notes.pdf");
    await expect(page.getByTestId("pdf-pending")).toContainText("photo.png");
    const shape = await firstPageShape(page);
    expect(shape.ratio).toBeCloseTo(300 / 200, 2);
    // Drawn from its signed S3 URL.
    expect(near(await colourAt(page, 0.5, 0.5), [200, 30, 30])).toBe(true);

    const stored = await storedDocument(page.url().split("/").pop() ?? "");
    expect(stored.document.type).toBe("pdf");
    expect(stored.document.sources.map((s) => s.fileName)).toEqual(["notes.pdf", "photo.png"]);
    expect(stored.document.bytes).toBe(image.length + paper.length);
    expect(stored.assets.map((a) => a.sha256).sort()).toEqual(
      [image, paper].map((b) => createHash("sha256").update(b).digest("hex")).sort(),
    );
    expect(stored.assets.every((a) => a.key.startsWith("test/e2e/"))).toBe(true);

    // The storage meter says where the space goes.
    await page.getByTestId("storage-details-trigger").click();
    const details = page.getByTestId("storage-details");
    await expect(details).toContainText("In documents");
    await expect(details).toContainText("Not in any document");
    await expect(details.getByRole("link", { name: "Sort the library by size" })).toBeVisible();
  });

  test("fetches a file from a web address", async ({ page, request }) => {
    // A file somewhere on the web: a signed S3 link to a PDF in another workspace.
    const personal = await personalWorkspaceId();
    const bytes = pdf();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const init = await request.post("/api/uploads/init", {
      data: {
        workspaceId: personal,
        fileName: "web.pdf",
        contentType: "application/pdf",
        size: bytes.length,
        sha256,
      },
    });
    const started = (await init.json()) as {
      uploadId: string;
      request: { url: string; method: string; headers: Record<string, string> };
    };
    await request.fetch(started.request.url, {
      method: started.request.method,
      headers: started.request.headers,
      data: bytes,
    });
    const done = await request.post(`/api/uploads/${started.uploadId}/complete`);
    const { asset } = (await done.json()) as { asset: { id: string } };
    await expect
      .poll(async () => {
        const res = await request.get(`/api/assets/${asset.id}`);
        return ((await res.json()) as { asset: { status: string } }).asset.status;
      })
      .toBe("ready");
    const { url } = (await (await request.get(`/api/assets/${asset.id}/url`)).json()) as {
      url: string;
    };

    await openWorkspace(page, await emptyWorkspace("Web"));
    const dialog = await openNew(page, "Import");
    await dialog.getByLabel("From a web address").fill(url);
    await dialog.getByTestId("import-url-fetch").click();
    const item = dialog.getByTestId("import-item");
    await expect(item).toHaveAttribute("data-status", "ready", { timeout: 60_000 });
    await dialog.getByTestId("create-import").click();
    await page.waitForURL(/\/app\/d\//);
    await expect(page.getByTestId("pdf-pending")).toBeVisible();
    const stored = await storedDocument(page.url().split("/").pop() ?? "");
    expect(stored.assets).toHaveLength(1);
    expect(stored.assets[0]).toMatchObject({ sha256, status: "ready" });
    expect(stored.assets[0]?.key.startsWith("test/e2e/")).toBe(true);
  });

  test("refuses addresses that are not https", async ({ page }) => {
    await openWorkspace(page, await emptyWorkspace("Http"));
    const dialog = await openNew(page, "Import");
    await dialog.getByLabel("From a web address").fill("http://example.com/a.pdf");
    await dialog.getByTestId("import-url-fetch").click();
    await expect(dialog.getByText("Use an https:// address")).toBeVisible();
  });

  test("files dropped anywhere on the library open the Import tab", async ({ page }) => {
    await openWorkspace(page, await emptyWorkspace("Drop"));
    const bytes = [...png(40, 60, [30, 90, 200])];
    await page.evaluate((data) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File([new Uint8Array(data)], "dropped.png", { type: "image/png" }));
      (window as unknown as { __drop: DataTransfer }).__drop = transfer;
      for (const type of ["dragenter", "dragover"]) {
        document.body.dispatchEvent(
          new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }),
        );
      }
    }, bytes);
    await expect(page.getByTestId("library-drop-overlay")).toBeVisible();
    await page.evaluate(() => {
      const transfer = (window as unknown as { __drop: DataTransfer }).__drop;
      document.body.dispatchEvent(
        new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: transfer }),
      );
    });
    const dialog = page.getByTestId("new-document-dialog");
    await expect(dialog.getByRole("tab", { name: "Import" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(dialog.getByTestId("import-item")).toContainText("dropped.png");
    await expect(dialog.getByTestId("import-item")).toHaveAttribute("data-status", "ready", {
      timeout: 60_000,
    });
    await dialog.getByTestId("create-import").click();
    await expectPages(page, 1, null);
    expect((await firstPageShape(page)).ratio).toBeCloseTo(40 / 60, 2);
  });

  test("uploads keep going in the tray: pause, resume and cancel", async ({ page }) => {
    test.setTimeout(180_000);
    await openWorkspace(page, await emptyWorkspace("Tray"));
    const dialog = await openNew(page, "Import");
    // Big enough to go up in 8 MB parts.
    await dialog.getByTestId("import-input").setInputFiles([
      { name: "big-lecture.pdf", mimeType: "application/pdf", buffer: pdf(17 * 1024 * 1024) },
      { name: "cancel-me.pdf", mimeType: "application/pdf", buffer: pdf(9 * 1024 * 1024) },
    ]);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    const tray = page.getByTestId("upload-tray");
    const row = (name: string) => tray.getByTestId("upload-row").filter({ hasText: name });
    await tray.getByRole("button", { name: "Cancel cancel-me.pdf" }).click();
    await expect(row("cancel-me.pdf")).toHaveAttribute("data-state", "cancelled");

    await tray.getByRole("button", { name: "Pause big-lecture.pdf" }).click();
    await expect(row("big-lecture.pdf")).toHaveAttribute("data-state", "paused");
    expect(await seriousViolations(page), "tray").toEqual([]);
    await tray.getByRole("button", { name: "Resume big-lecture.pdf" }).click();
    await expect(row("big-lecture.pdf")).toHaveAttribute("data-state", "done", {
      timeout: 150_000,
    });
  });
});

test.describe("accessibility", () => {
  for (const scheme of ["light", "dark"] as const) {
    test(`the New dialog and a document page have no serious issues (${scheme})`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openWorkspace(page, await emptyWorkspace("A11y new"));
      const dialog = await openNew(page);
      expect(await seriousViolations(page), "notebook").toEqual([]);
      for (const tab of ["Infinite canvas", "Import", "Templates"] as const) {
        await dialog.getByRole("tab", { name: tab }).click();
        if (tab === "Templates") await expect(dialog.getByTestId("system-templates")).toBeVisible();
        expect(await seriousViolations(page), tab).toEqual([]);
      }
      await dialog.getByRole("tab", { name: "Notebook" }).click();
      await dialog.getByTestId("create-notebook").click();
      await expectPages(page, 1, null);
      expect(await seriousViolations(page), "document").toEqual([]);
    });
  }
});
