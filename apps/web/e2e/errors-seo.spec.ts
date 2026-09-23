import { expect, test } from "@playwright/test";

test("unknown URLs show the custom 404", async ({ page }) => {
  const res = await page.goto("/this/does/not/exist");
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: "This page isn’t in the notebook." }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to the home page" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("home has title, description, canonical and Open Graph tags", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/Paper & Chalk/);
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /PDFs/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    "href",
    /^https?:\/\/[^/]+\/?$/,
  );
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    "content",
    /opengraph-image/,
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
});

test("Open Graph image, icons, sitemap and robots are served", async ({ request }) => {
  const og = await request.get("/opengraph-image");
  expect(og.ok()).toBe(true);
  expect(og.headers()["content-type"]).toBe("image/png");

  for (const path of ["/icon.svg", "/favicon.ico", "/apple-icon", "/manifest.webmanifest"]) {
    expect((await request.get(path)).ok(), path).toBe(true);
  }

  const robots = await (await request.get("/robots.txt")).text();
  expect(robots).toContain("Disallow: /app");
  expect(robots).toContain("Sitemap:");

  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>");
});
