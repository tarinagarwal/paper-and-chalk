import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { expect, type Page } from "@playwright/test";

import { E2E_OUTBOX_DIR } from "../playwright.config";

interface OutboxEmail {
  to: string;
  subject: string;
  link?: string;
  sentAt: string;
}

/** Waits for the newest email to `to` written after `since`, and returns it. */
export async function waitForEmail(to: string, since: number, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = await readdir(E2E_OUTBOX_DIR).catch(() => [] as string[]);
    const candidates = files
      .filter((f) => f.endsWith(".json") && f.includes(to.replace(/[^a-z0-9@._-]/gi, "_")))
      .filter((f) => Number(f.split("-")[0]) >= since)
      .sort();
    const newest = candidates.at(-1);
    if (newest) {
      return JSON.parse(await readFile(join(E2E_OUTBOX_DIR, newest), "utf8")) as OutboxEmail;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`no email to ${to} within ${String(timeoutMs)} ms`);
}

/** Requests a magic link through the real form and returns the link from the email. */
export async function requestMagicLink(page: Page, email: string, path = "/sign-in") {
  await page.goto(path);
  const since = Date.now();
  await page.getByLabel("Email").fill(email);
  await page.getByTestId("magic-link-submit").click();
  await expect(page).toHaveURL(/\/sign-in\/verify\?/);
  await expect(page.getByTestId("verify-email")).toHaveText(email);
  const message = await waitForEmail(email, since);
  expect(message.subject).toContain("sign-in link");
  if (!message.link) throw new Error("email has no link");
  return message.link;
}

/** Full sign-in through the form and the emailed link. */
export async function signIn(page: Page, email: string, path = "/sign-in") {
  const link = await requestMagicLink(page, email, path);
  await page.goto(link);
}

/** Fills the "What should we call you?" dialog shown to new users. */
export async function chooseName(page: Page, name: string) {
  const dialog = page.getByTestId("name-dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Your name").fill(name);
  await dialog.getByTestId("name-submit").click();
  await expect(dialog).toBeHidden();
  // The page refreshes with the new name; wait until the library itself has rendered.
  await expect(page.getByRole("heading", { name: "Home", level: 1 })).toBeVisible();
}

export const uniqueEmail = (label: string) =>
  `${label}-${String(Date.now())}-${String(Math.floor(Math.random() * 1e6))}@paperchalk.test`;
