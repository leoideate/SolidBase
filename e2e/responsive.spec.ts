import { expect, test, type Page } from "@playwright/test";
import { lastWeek, login, logout, reseed } from "./helpers";

/** Q03: clocking, weekly review and manager approval screens without clipped controls or page-level horizontal scroll. */
test.beforeAll(() => reseed());

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

test("key screens fit the viewport", async ({ page }) => {
  await login(page, "pat");
  for (const path of ["/clock", `/timesheets/${lastWeek()}`, "/history"]) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
  await expect(page.getByRole("link", { name: "Clock" })).toBeVisible();
  await logout(page);

  await login(page, "sean");
  await page.goto("/team");
  await noHorizontalScroll(page);
  await page.getByRole("link", { name: /Pat Doyle/ }).first().click();
  await noHorizontalScroll(page);
  const approve = page.getByRole("button", { name: "Approve" });
  await approve.scrollIntoViewIfNeeded();
  await expect(approve).toBeInViewport();
  await page.goto("/team/overview");
  await noHorizontalScroll(page);
  await logout(page);

  await login(page, "admin");
  for (const path of ["/admin", "/admin/users", "/admin/rates", "/admin/projects", "/admin/support", "/admin/audit"]) {
    await page.goto(path);
    await noHorizontalScroll(page);
  }
  await logout(page);

  await login(page, "owner");
  await page.goto("/costs");
  await noHorizontalScroll(page);
});
