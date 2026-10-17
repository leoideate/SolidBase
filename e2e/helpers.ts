import { execSync } from "node:child_process";
import { expect, type Page } from "@playwright/test";

/** Demo PIN from scripts/seed.ts (test database only). */
export const PIN = "246810";

/** Reset the TEST database to the demo seed (pat's previous week submitted). */
export function reseed() {
  execSync("pnpm exec tsx scripts/seed.ts --test", { stdio: "pipe" });
}

export async function login(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("PIN").fill(PIN);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

export async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login/);
}

/** Monday of last week in Dublin time, as the seed uses. */
export function lastWeek(): string {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Dublin", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" });
  const now = new Date();
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday);
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  local.setUTCDate(local.getUTCDate() - dow - 7);
  return local.toISOString().slice(0, 10);
}

/** Open pat's submitted week from the manager queue and return its review URL. */
export async function openPatFromQueue(page: Page) {
  await page.goto("/team");
  await page.getByRole("link", { name: /Pat Doyle/ }).first().click();
  await expect(page.getByRole("heading", { name: "Pat Doyle" })).toBeVisible();
  return page.url();
}
