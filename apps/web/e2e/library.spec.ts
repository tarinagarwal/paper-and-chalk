import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

import { AUTH_STATE } from "../playwright.config";
import {
  card,
  drag,
  openWorkspace,
  seedBigWorkspace,
  seedWorkspace,
  titles,
  type SeedSpec,
} from "./library-helpers";

const unique = (label: string) =>
  `${label} ${String(Date.now() % 1e7)}${String(Math.floor(Math.random() * 1e3))}`;

const SPEC: SeedSpec = {
  folders: [{ name: "Biology" }, { name: "Chemistry" }, { name: "Genetics", parent: "Biology" }],
  tags: ["Exam", "Review"],
  docs: [
    { title: "Lecture 10", folder: "Biology", tags: ["Exam"] },
    { title: "Lecture 9", folder: "Biology" },
    { title: "Organic reactions", type: "pdf", folder: "Chemistry", tags: ["Exam", "Review"] },
    { title: "Mind map", type: "canvas" },
    { title: "Past paper 2025", type: "pdf", tags: ["Review"] },
    { title: "Weekly notes" },
  ],
};

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map(
      (v) =>
        `${v.id}: ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join(" | ")}`,
    );
}

const toast = (page: Page, text: string | RegExp) =>
  page.locator("[data-sonner-toast]").filter({ hasText: text }).first();

test.describe("library", () => {
  test.use({ storageState: AUTH_STATE });
  test.setTimeout(90_000);

  test("browses, sorts, filters, switches views and searches titles", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedWorkspace(unique("Browse"), SPEC);
    await openWorkspace(page, seeded.workspaceId);

    await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("6 documents");
    // Newest first by default.
    expect((await titles(page))[0]).toBe("Weekly notes");

    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitemradio", { name: "Name" }).click();
    await expect
      .poll(() => titles(page))
      .toEqual([
        "Lecture 9",
        "Lecture 10",
        "Mind map",
        "Organic reactions",
        "Past paper 2025",
        "Weekly notes",
      ]);
    await expect(page).toHaveURL(/sort=name/);
    await page.getByTestId("sort-direction").click();
    await expect.poll(async () => (await titles(page))[0]).toBe("Weekly notes");

    await page.getByTestId("filters-button").click();
    await page.getByTestId("filters-panel").getByLabel("PDF").check();
    await expect(page.getByTestId("library-count")).toHaveText("2 documents");
    await page.getByTestId("filters-panel").getByLabel("Exam").check();
    await expect(page.getByTestId("library-count")).toHaveText("1 document");
    await expect(page).toHaveURL(/types=pdf/);
    // The URL keeps the view: a reload shows the same thing.
    await page.reload();
    await expect(page.getByTestId("library-count")).toHaveText("1 document");
    await expect(card(page, "Organic reactions")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filters-panel").getByRole("button", { name: "Clear filters" }).click();
    await expect(page.getByTestId("library-count")).toHaveText("6 documents");
    await page.keyboard.press("Escape");

    await page.getByRole("radio", { name: "List view" }).click();
    await expect(page.getByTestId("library-grid")).toHaveAttribute("data-view", "list");
    await expect(page.getByRole("row").filter({ hasText: "Organic reactions" })).toContainText(
      "PDF",
    );
    // The choice is remembered.
    await page.reload();
    await expect(page.getByTestId("library-grid")).toHaveAttribute("data-view", "list");
    await page.getByRole("radio", { name: "Grid view" }).click();

    // Folders open from the sidebar and show their subfolders.
    await page.getByTestId("folder-tree").getByRole("link", { name: "Biology" }).click();
    await expect(page.getByRole("heading", { name: "Biology", level: 1 })).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("2 documents");
    await expect(
      page.getByRole("list", { name: "Subfolders" }).getByRole("link", { name: "Genetics" }),
    ).toBeVisible();

    // Title search: fuzzy, from the top bar.
    await page.getByTestId("library-search").fill("organik reaction");
    const results = page.getByTestId("search-results");
    await expect(results.getByRole("option").first()).toContainText("Organic reactions");
    await page.getByTestId("library-search").press("ArrowDown");
    await page.getByTestId("library-search").press("Enter");
    await expect(page).toHaveURL(/\/app\/search\?q=organik/);
    await expect(card(page, "Organic reactions")).toHaveAttribute("aria-selected", "true");
  });

  test("renames inline, moves with the dialog and by dragging onto a sidebar folder", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedWorkspace(unique("Organise"), SPEC);
    await openWorkspace(page, seeded.workspaceId);

    await card(page, "Weekly notes").click();
    await page.keyboard.press("F2");
    await page.getByTestId("rename-input").fill("Weekly notes, week 3");
    await page.getByTestId("rename-input").press("Enter");
    await expect(card(page, "Weekly notes, week 3")).toBeVisible();

    await card(page, "Mind map").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Move to…" }).click();
    const dialog = page.getByTestId("move-dialog");
    await dialog.getByText("Chemistry").click();
    await dialog.getByTestId("move-submit").click();
    await expect(toast(page, "Moved 1 document to Chemistry")).toBeVisible();
    await expect(toast(page, "Moved 1 document to Chemistry")).toBeHidden({ timeout: 10_000 });

    await drag(
      page,
      card(page, "Past paper 2025"),
      page.getByTestId("folder-tree").getByRole("link", { name: "Chemistry" }),
    );
    await expect(toast(page, "Moved 1 document to Chemistry")).toBeVisible();
    await page.getByTestId("folder-tree").getByRole("link", { name: "Chemistry" }).click();
    await expect(page.getByTestId("library-count")).toHaveText("3 documents");
    await expect(card(page, "Past paper 2025")).toBeVisible();
    await expect(card(page, "Mind map")).toBeVisible();

    // The rename stuck on the server.
    await page.goto("/app");
    await expect(card(page, "Weekly notes, week 3")).toBeVisible();
  });

  test("selects with shift, cmd and the keyboard, trashes, restores and deletes forever", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedWorkspace(unique("Trash"), SPEC);
    await openWorkspace(page, seeded.workspaceId);
    const mod = process.platform === "darwin" ? "Meta" : "Control";

    await card(page, "Weekly notes").click();
    await card(page, "Mind map").click({ modifiers: ["Shift"] });
    await expect(page.getByTestId("selection-bar")).toContainText("3 selected");
    await card(page, "Past paper 2025").click({ modifiers: [mod] });
    await expect(page.getByTestId("selection-bar")).toContainText("2 selected");
    // Arrow keys move the focus; Delete trashes the selection.
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Shift+ArrowRight");
    await expect(page.getByTestId("selection-bar")).toContainText("2 selected");
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("selection-bar")).toBeHidden();

    await card(page, "Weekly notes").click();
    await card(page, "Past paper 2025").click({ modifiers: ["Shift"] });
    await page.keyboard.press("Delete");
    await expect(toast(page, "Moved 2 documents to the trash")).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("4 documents");

    await page.getByTestId("nav-trash").click();
    await expect(page.getByRole("heading", { name: "Trash", level: 1 })).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("2 documents");
    await expect(card(page, "Weekly notes")).toContainText("Deleted forever in 30 days");

    await card(page, "Weekly notes").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Restore" }).click();
    await expect(page.getByTestId("library-count")).toHaveText("1 document");

    await card(page, "Past paper 2025").click();
    await page.keyboard.press("Delete");
    await page.getByTestId("purge-dialog").getByTestId("purge-confirm").click();
    await expect(toast(page, "Deleted 1 document forever")).toBeVisible();
    await expect(page.getByTestId("library-empty")).toContainText("The trash is empty");

    await page.getByRole("link", { name: "Home" }).first().click();
    await expect(page.getByTestId("library-count")).toHaveText("5 documents");
  });

  test("box-selects with the mouse and moves the selection by dragging", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedWorkspace(unique("Box"), SPEC);
    await openWorkspace(page, seeded.workspaceId);

    // Drag a box from the empty space right of the last card up over the first row.
    const grid = page.getByTestId("library-grid");
    const box = await grid.boundingBox();
    const first = await card(page, "Weekly notes").boundingBox();
    const third = await card(page, "Organic reactions").boundingBox();
    if (!box || !first || !third) throw new Error("layout");
    const startX = box.x + box.width - 4;
    const startY = first.y + first.height + 8;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(third.x + third.width / 2, first.y + 20, { steps: 10 });
    await page.mouse.up();
    const selected = await page
      .getByTestId("library-grid")
      .locator('[aria-selected="true"]')
      .count();
    expect(selected).toBeGreaterThanOrEqual(2);
    await expect(page.getByTestId("selection-bar")).toContainText("selected");

    await drag(
      page,
      grid.locator('[aria-selected="true"]').first(),
      page.getByTestId("folder-tree").getByRole("link", { name: "Biology" }),
    );
    await expect(toast(page, `Moved ${String(selected)} documents to Biology`)).toBeVisible();
  });

  test("favourites, recents, tags and smart folders", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedWorkspace(unique("Views"), SPEC);
    await openWorkspace(page, seeded.workspaceId);

    await card(page, "Mind map").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Add to favourites" }).click();
    await expect(toast(page, "Added 1 document to favourites")).toBeVisible();

    await card(page, "Lecture 9").dblclick();
    await expect(toast(page, "Opening “Lecture 9”")).toBeVisible();

    await card(page, "Weekly notes").click({ button: "right" });
    await page.getByRole("menuitem", { name: "Tags" }).hover();
    await page.getByRole("menuitem", { name: "New tag…" }).click();
    const tagDialog = page.getByTestId("tag-dialog");
    const tagName = unique("Urgent");
    await tagDialog.getByLabel("Name").fill(tagName);
    await tagDialog.getByTestId("tag-submit").click();
    await expect(toast(page, `Tagged 1 document “${tagName}”`)).toBeVisible();

    await page.getByRole("link", { name: "Favourites" }).click();
    await expect(card(page, "Mind map")).toBeVisible();
    await page.getByRole("link", { name: "Recents" }).click();
    await expect(card(page, "Lecture 9")).toBeVisible();
    await page.getByRole("list", { name: "Tags" }).getByRole("link", { name: tagName }).click();
    await expect(page.getByRole("heading", { name: tagName, level: 1 })).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("1 document");

    // Smart folder: PDFs tagged Review.
    await page.getByRole("link", { name: "Home" }).first().click();
    await page.getByTestId("filters-button").click();
    await page.getByTestId("filters-panel").getByLabel("PDF").check();
    await page.getByTestId("filters-panel").getByLabel("Review").check();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("library-count")).toHaveText("2 documents");
    await page.getByTestId("save-smart-folder").click();
    await page.getByTestId("smart-folder-dialog").getByLabel("Name").fill("PDFs to review");
    await page.getByTestId("smart-folder-submit").click();
    await expect(page.getByRole("heading", { name: "PDFs to review", level: 1 })).toBeVisible();
    await expect(page.getByTestId("library-count")).toHaveText("2 documents");
    await expect(
      page
        .getByRole("list", { name: "Smart folders" })
        .getByRole("link", { name: "PDFs to review" }),
    ).toBeVisible();
  });

  test("creates, colours and nests folders in the sidebar", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    const seeded = await seedWorkspace(unique("Folders"), { docs: [{ title: "Loose" }] });
    await openWorkspace(page, seeded.workspaceId);
    const tree = page.getByTestId("folder-tree");

    for (const name of ["Maths", "Physics"]) {
      await page.getByTestId("new-folder").click();
      await page.getByTestId("folder-dialog").getByLabel("Name").fill(name);
      await page.getByTestId("folder-submit").click();
      await expect(tree.getByRole("link", { name })).toBeVisible();
    }
    await tree.getByRole("button", { name: "Actions for Physics" }).click();
    await page.getByRole("menuitem", { name: "Rename, colour and icon" }).click();
    const dialog = page.getByTestId("folder-dialog");
    await dialog.locator('label[title="Teal"]').click();
    await dialog.locator('label[title="Flask"]').click();
    await expect(dialog.getByLabel("Teal")).toBeChecked();
    await dialog.getByTestId("folder-submit").click();
    await expect(dialog).toBeHidden();

    // Drag Physics into Maths: it nests, and Maths gets an expand button.
    await drag(
      page,
      tree.getByRole("link", { name: "Physics" }),
      tree.getByRole("link", { name: "Maths" }),
    );
    await expect(tree.getByRole("button", { name: /Expand Maths|Collapse Maths/ })).toBeVisible();
    await page.reload();
    await tree.getByRole("button", { name: "Expand Maths" }).click();
    await expect(
      page.getByRole("list", { name: "Folders in Maths" }).getByRole("link", { name: "Physics" }),
    ).toBeVisible();
  });

  test("stays fast with 10,000 documents", async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1440, height: 900 });
    const workspaceId = await seedBigWorkspace(10_000);
    const started = Date.now();
    await openWorkspace(page, workspaceId);
    await expect(page.getByTestId("library-count")).toHaveText("10,000 documents");
    const firstPaint = Date.now() - started;

    // Scroll far: each page loads as the end comes into view, but only rows near the viewport are
    // in the DOM.
    const height = () => page.evaluate(() => document.documentElement.scrollHeight);
    for (let i = 0; i < 6; i++) {
      const before = await height();
      await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
      });
      await expect.poll(height).toBeGreaterThan(before);
    }
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(10_000);
    const rendered = await page.getByTestId("library-item").count();
    expect(rendered).toBeLessThan(120);

    // Sorting all 10,000 by name is one indexed query.
    const sortStart = Date.now();
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await page.getByTestId("sort-button").click();
    await page.getByRole("menuitemradio", { name: "Size" }).click();
    await expect(page).toHaveURL(/sort=size/);
    await expect(page.getByTestId("library-grid")).toHaveAttribute("aria-busy", "false");
    const sortMs = Date.now() - sortStart;
    test.info().annotations.push({
      type: "performance",
      description: `first render ${String(firstPaint)} ms, resort ${String(sortMs)} ms, ${String(rendered)} items in the DOM after scrolling`,
    });
    expect(sortMs).toBeLessThan(5_000);
  });

  test("the library has no serious accessibility issues, in both themes and views", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const seeded = await seedWorkspace(unique("A11y"), SPEC);
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
      await openWorkspace(page, seeded.workspaceId);
      expect(await seriousViolations(page), `grid ${scheme}`).toEqual([]);
      await card(page, "Mind map").click();
      await card(page, "Weekly notes").click({ modifiers: ["Shift"] });
      expect(await seriousViolations(page), `selection ${scheme}`).toEqual([]);
      // The selection bar stands in for the toolbar until the selection is cleared.
      await page.keyboard.press("Escape");
      await page.getByRole("radio", { name: "List view" }).click();
      expect(await seriousViolations(page), `list ${scheme}`).toEqual([]);
      await page.getByRole("radio", { name: "Grid view" }).click();
      await page.getByTestId("new-document").click();
      expect(await seriousViolations(page), `new dialog ${scheme}`).toEqual([]);
      await page.keyboard.press("Escape");
    }
  });

  test("phones get two columns and the folders in the sidebar sheet", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const seeded = await seedWorkspace(unique("Phone"), SPEC);
    await openWorkspace(page, seeded.workspaceId);
    await expect(card(page, "Past paper 2025")).toBeVisible();
    // The first two cards share a row.
    await expect
      .poll(async () => {
        const a = await card(page, "Weekly notes").boundingBox();
        const b = await card(page, "Past paper 2025").boundingBox();
        return a && b ? Math.abs(a.y - b.y) < 2 && b.x > a.x : false;
      })
      .toBe(true);
    await page.getByTestId("sidebar-trigger").click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Biology" })).toBeVisible();
  });
});
