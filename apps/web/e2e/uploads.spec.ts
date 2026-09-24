import { randomBytes } from "node:crypto";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";

/** A small real PDF with random bytes after the header, so every run hashes differently. */
const pdf = (name = "notes.pdf") => ({
  name,
  mimeType: "application/pdf",
  buffer: Buffer.concat([Buffer.from("%PDF-1.7\n"), randomBytes(4096)]),
});

/** Big enough to go up in 8 MB parts. */
const video = (name: string) => {
  const buffer = randomBytes(17 * 1024 * 1024);
  Buffer.from([0, 0, 0, 0x18, ...Buffer.from("ftypisom")]).copy(buffer);
  return { name, mimeType: "video/mp4", buffer };
};

const row = (page: Page, name: string) =>
  page.getByTestId("upload-tray").getByTestId("upload-row").filter({ hasText: name }).last();

/** Slows uploads so pause and cancel can be pressed mid-flight. */
async function throttleUploads(page: Page, bytesPerSecond: number) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: bytesPerSecond,
  });
  return () =>
    cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
}

test.describe("uploads (dev page)", () => {
  test.use({ storageState: AUTH_STATE });
  test.setTimeout(120_000);

  test.beforeEach(async ({ page }) => {
    await page.goto("/app/dev/upload");
    await expect(page.getByRole("heading", { name: "Upload test", level: 1 })).toBeVisible();
  });

  test("uploads a PDF to S3, verifies it, opens and downloads it, and dedupes a second copy", async ({
    page,
    request,
  }) => {
    const file = pdf();
    await page.getByTestId("upload-input").setInputFiles(file);
    await expect(row(page, file.name)).toHaveAttribute("data-state", "done", { timeout: 60_000 });
    await expect(row(page, file.name).getByTestId("upload-status")).toContainText("Uploaded");

    const uploaded = page
      .getByTestId("uploaded-list")
      .getByRole("listitem")
      .filter({ hasText: file.name });
    await expect(uploaded).toContainText("ready");
    // The tray sits over the bottom of the page; close it as a person would.
    await page.getByRole("button", { name: "Close uploads" }).click();
    await expect(page.getByTestId("upload-tray")).toBeHidden();

    // Open: a 15-minute signed S3 URL that serves the exact bytes.
    await page.evaluate(() => {
      (window as Window & { opened?: string }).opened = "";
      window.open = (url) => {
        (window as Window & { opened?: string }).opened = String(url);
        return null;
      };
    });
    await uploaded.getByRole("button", { name: "Open" }).click();
    await expect
      .poll(() => page.evaluate(() => (window as Window & { opened?: string }).opened))
      .toMatch(/amazonaws\.com\/.*X-Amz-Expires=900/);
    const url = await page.evaluate(() => (window as Window & { opened?: string }).opened ?? "");
    const response = await request.get(url);
    expect(response.status()).toBe(200);
    expect(Buffer.compare(await response.body(), file.buffer)).toBe(0);

    const download = page.waitForEvent("download");
    await uploaded.getByRole("button", { name: "Download" }).click();
    expect((await download).suggestedFilename()).toBe(file.name);

    // The same bytes again: nothing is uploaded, the existing file is reused.
    await page.getByTestId("upload-input").setInputFiles({ ...file, name: "copy.pdf" });
    await expect(row(page, "copy.pdf").getByTestId("upload-status")).toHaveText(
      "Already in this workspace",
      { timeout: 30_000 },
    );
  });

  test("rejects a file whose contents are not what its type says", async ({ page }) => {
    await page.getByTestId("upload-input").setInputFiles({
      name: "not-really.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(`<html><script>alert(1)</script>${randomBytes(64).toString("hex")}`),
    });
    await expect(row(page, "not-really.pdf")).toHaveAttribute("data-state", "failed", {
      timeout: 60_000,
    });
    await expect(row(page, "not-really.pdf").getByTestId("upload-status")).toContainText(
      "don't match its type",
    );
  });

  test("refuses unsupported files before uploading", async ({ page }) => {
    await page.getByTestId("upload-input").setInputFiles({
      name: "drawing.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    });
    await expect(row(page, "drawing.svg").getByTestId("upload-status")).toHaveText(
      "This type of file can't be uploaded.",
    );
  });

  test("pauses and resumes a multipart upload without starting over", async ({ page }) => {
    const unthrottle = await throttleUploads(page, 1024 * 1024);
    const file = video("lecture.mp4");
    await page.getByTestId("upload-input").setInputFiles(file);
    const item = row(page, file.name);
    await expect(item.getByTestId("upload-status")).toContainText("Uploading", { timeout: 30_000 });
    await expect(item.getByTestId("upload-status")).not.toContainText("Uploading 0 bytes", {
      timeout: 30_000,
    });

    await item.getByRole("button", { name: `Pause ${file.name}` }).click();
    await expect(item).toHaveAttribute("data-state", "paused");
    await expect(item.getByTestId("upload-status")).toContainText("Paused at");

    await unthrottle();
    await item.getByRole("button", { name: `Resume ${file.name}` }).click();
    await expect(item).toHaveAttribute("data-state", "done", { timeout: 90_000 });
  });

  test("cancels an upload", async ({ page }) => {
    await throttleUploads(page, 512 * 1024);
    const file = video("cancel-me.mp4");
    await page.getByTestId("upload-input").setInputFiles(file);
    const item = row(page, file.name);
    await expect(item.getByTestId("upload-status")).toContainText("Uploading", { timeout: 30_000 });
    await item.getByRole("button", { name: `Cancel ${file.name}` }).click();
    await expect(item).toHaveAttribute("data-state", "cancelled");
    await item.getByRole("button", { name: `Dismiss ${file.name}` }).click();
    await expect(item).toBeHidden();
  });

  test("the page and tray have no serious accessibility issues", async ({ page }) => {
    await page.getByTestId("upload-input").setInputFiles({
      name: "a11y.svg",
      mimeType: "image/svg+xml",
      buffer: Buffer.from("<svg/>"),
    });
    await expect(page.getByTestId("upload-tray")).toBeVisible();
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      results.violations
        .filter((v) => v.impact === "serious" || v.impact === "critical")
        .map((v) => v.id),
    ).toEqual([]);
  });
});
