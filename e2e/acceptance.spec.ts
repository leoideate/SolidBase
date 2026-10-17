import { expect, test } from "@playwright/test";
import { lastWeek, login, logout, openPatFromQueue, reseed } from "./helpers";

test.beforeEach(() => reseed());

test("T01 complete shift survives logout and browser closure", async ({ page, browser }) => {
  await login(page, "mary");
  await page.getByLabel("Project").selectOption({ label: "P001 · Main Street Apartments" });
  await page.getByLabel("Role").selectOption({ label: "General operative" });
  await page.getByRole("button", { name: "Clock in" }).click();
  await expect(page.getByText("Clocked in. Your shift is saved.")).toBeVisible();
  await expect(page.getByText("On shift")).toBeVisible();

  // "Close the browser": a brand-new context with no cookies, then log in again.
  await logout(page);
  const ctx = await browser.newContext();
  const page2 = await ctx.newPage();
  await login(page2, "mary");
  await expect(page2.getByText("On shift")).toBeVisible();
  await expect(page2.getByText("P001 · Main Street Apartments")).toBeVisible();
  await page2.getByRole("button", { name: "Clock out" }).click();
  await expect(page2.getByText("Clocked out. Your shift is saved.")).toBeVisible();
  await expect(page2.getByRole("button", { name: "Clock in" })).toBeVisible();
  await ctx.close();
});

test("T02 multiple allocations: 40 approved hours and €1,135", async ({ page }) => {
  await login(page, "sean");
  await openPatFromQueue(page);
  await expect(page.getByRole("cell", { name: "€1,135.00" }).first()).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/Approved version 1\. It is now locked\./).first()).toBeVisible();
  await logout(page);

  await login(page, "pat");
  await page.goto(`/timesheets/${lastWeek()}`);
  const approvedHours = page.locator(".card", { hasText: "Approved hours" });
  await expect(approvedHours).toContainText("40.00");
  await expect(page.locator(".card", { hasText: "Approved value" })).toContainText("€1,135.00");
  for (const [proj, role, value] of [["P001", "Dumper driver", "€560.00"], ["P002", "Digger driver", "€450.00"], ["P001", "General operative", "€125.00"]]) {
    await expect(page.getByRole("row", { name: new RegExp(`${proj}.*${role}.*${value.replace(/[.$€]/g, "\\$&")}`) })).toBeVisible();
  }
});

test("T03 isolation across workers, managers, exports and direct requests", async ({ page }) => {
  await login(page, "sean");
  const patUrl = await openPatFromQueue(page);
  await logout(page);

  // Manager B cannot open a worker assigned only to manager A.
  await login(page, "niamh");
  await expect(page.getByRole("link", { name: /Pat Doyle/ })).toHaveCount(0);
  const res = await page.goto(patUrl);
  expect(res?.status()).toBe(404);
  await logout(page);

  // Approve pat, then confirm manager B's export (enabled in the seed) contains none of pat's rows.
  await login(page, "sean");
  await page.goto(patUrl);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/It is now locked/).first()).toBeVisible();
  await logout(page);
  await login(page, "niamh");
  const csv = await page.request.get(`/api/export?scope=team&from=${lastWeek()}&to=${lastWeek()}`);
  expect(csv.status()).toBe(200);
  expect(await csv.text()).not.toContain("W001");
  const direct = await page.request.get(`/api/export?scope=team&from=${lastWeek()}&to=${lastWeek()}&worker=${encodeURIComponent("does-not-matter")}`);
  expect(await direct.text()).not.toContain("W001");
});

test("T03b worker cannot reach another worker or export", async ({ page }) => {
  await login(page, "sean");
  const patUrl = await openPatFromQueue(page);
  await logout(page);
  await login(page, "tom");
  expect((await page.goto(patUrl))?.status()).toBe(404);
  expect((await page.goto("/team"))?.url()).not.toContain("/team");
  const csv = await page.request.get(`/api/export?scope=team&from=${lastWeek()}&to=${lastWeek()}`);
  expect(csv.status()).toBe(403);
  const cost = await page.request.get(`/api/export?scope=costmaster&from=${lastWeek()}&to=${lastWeek()}`);
  expect(cost.status()).toBe(403);
});

test("T04 correction with reason, return and resubmit", async ({ page }) => {
  await login(page, "sean");
  await openPatFromQueue(page);
  const firstCorrect = page.getByText("Correct", { exact: true }).first();
  await firstCorrect.click();
  const form = page.locator("details[open] form").first();
  await form.locator('select[name="projectId"]').selectOption({ label: "P003 · Riverside School Extension" });
  await form.locator('input[name="reason"]').fill("Worker was on the school site");
  await form.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByText(/Correction saved|Entry corrected/).first()).toBeVisible();
  await expect(page.getByText("Worker was on the school site").first()).toBeVisible();
  await page.getByPlaceholder("What does the worker need to clarify?").fill("Please confirm Monday was P003");
  await page.getByRole("button", { name: "Return to worker" }).click();
  await expect(page.getByText(/Returned to the worker/).first()).toBeVisible();
  await logout(page);

  await login(page, "pat");
  await page.goto(`/timesheets/${lastWeek()}`);
  await expect(page.getByText(/Returned by Seán Murphy/)).toBeVisible();
  await expect(page.getByText("Entry corrected")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Resubmit" }).click();
  await expect(page.getByText(/Submitted \(version 3\)/).first()).toBeVisible();
});

test("T05 approved data is locked until reopened with a reason", async ({ page }) => {
  await login(page, "sean");
  await openPatFromQueue(page);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/It is now locked/).first()).toBeVisible();
  await page.reload();
  await expect(page.getByText("Correct", { exact: true })).toHaveCount(0);
  await page.getByPlaceholder("Reason (required)").fill("Payroll query");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByText(/Reopened as version 2/).first()).toBeVisible();
});

test("T06 repeated clicks and simultaneous requests create one entry", async ({ page }) => {
  await login(page, "tom");
  const ids = await page.evaluate(async () => {
    const sel = (n: string) => [...(document.querySelector(`#${n}`) as HTMLSelectElement).options].find((o) => o.value)!.value;
    const body = (key: string) => JSON.stringify({ action: "in", key, projectId: sel("project"), jobRoleId: sel("role") });
    const same = crypto.randomUUID();
    const reqs = [...Array(5)].map(() => fetch("/api/clock", { method: "POST", headers: { "content-type": "application/json" }, body: body(same) }));
    const diff = [...Array(5)].map(() => fetch("/api/clock", { method: "POST", headers: { "content-type": "application/json" }, body: body(crypto.randomUUID()) }));
    const all = await Promise.all([...reqs, ...diff]);
    return Promise.all(all.map(async (r) => ({ status: r.status, ...(await r.json()) })));
  });
  const created = new Set(ids.filter((r) => r.ok).map((r) => r.entryId));
  expect(created.size).toBe(1);
  expect(ids.filter((r) => !r.ok).every((r) => r.status === 409)).toBe(true);
});

test("T07 approved screen totals match CSV totals and versions", async ({ page }) => {
  await login(page, "sean");
  await openPatFromQueue(page);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/It is now locked/).first()).toBeVisible();
  const res = await page.request.get(`/api/export?scope=team&from=${lastWeek()}&to=${lastWeek()}`);
  expect(res.status()).toBe(200);
  const text = (await res.text()).replace(/^﻿/, "");
  const [header, ...rows] = text.trim().split(/\r\n/);
  const cols = header.split(",");
  const hoursIdx = cols.indexOf("Duration seconds");
  const valueIdx = cols.indexOf("Timesheet value");
  const versionIdx = cols.indexOf("Approved version");
  expect(rows).toHaveLength(7);
  const seconds = rows.reduce((s, r) => s + Number(r.split(",")[hoursIdx]), 0);
  const value = rows.reduce((s, r) => s + Number(r.split(",")[valueIdx]), 0);
  expect(seconds / 3600).toBe(40);
  expect(value.toFixed(2)).toBe("1135.00");
  expect(rows.every((r) => r.split(",")[versionIdx] === "1")).toBe(true);
  expect(rows[0]).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\+01:00|Z)/);
});

test("T08 IT has no business access; CostMaster sees totals but cannot approve", async ({ page }) => {
  await login(page, "it.support");
  await expect(page).toHaveURL(/\/system/);
  await expect(page.getByText("You have no access to worker or financial records")).toBeVisible();
  await page.goto("/team/overview");
  await expect(page).not.toHaveURL(/\/team\/overview/);
  await logout(page);

  await login(page, "sean");
  const patUrl = await openPatFromQueue(page);
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText(/It is now locked/).first()).toBeVisible();
  await logout(page);

  await login(page, "owner");
  await expect(page).toHaveURL(/\/costs/);
  await expect(page.getByText("Cost basis:")).toBeVisible();
  await expect(page.getByRole("row", { name: /P001 Main Street Apartments.*€685\.00/ })).toBeVisible();
  await expect(page.getByText("Not included").first()).toBeVisible();
  const res = await page.goto(patUrl);
  expect(res?.status()).toBe(404);
});
