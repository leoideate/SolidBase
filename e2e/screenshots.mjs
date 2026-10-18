// Captures every dashboard for each role (run against a server with demo data).
// Usage: node e2e/screenshots.mjs [baseUrl]   → docs/screenshots/*.png
import { mkdirSync } from "node:fs";
import { chromium, devices } from "@playwright/test";

const BASE = process.argv[2] ?? "http://localhost:3200";
const OUT = "docs/screenshots";
const PIN = "246810"; // demo seed PIN (scripts/seed.ts)
mkdirSync(OUT, { recursive: true });

const shots = [
  { user: "pat", device: "phone", pages: [["01-worker-clock", "/clock"], ["02-worker-week", "/timesheets/LASTWEEK"], ["03-worker-history", "/history"]] },
  { user: "sean", device: "desktop", pages: [["04-manager-queue", "/team"], ["05-manager-review", "REVIEW"], ["06-manager-overview", "/team/overview"]] },
  { user: "sean", device: "phone", pages: [["07-manager-review-phone", "REVIEW"]] },
  { user: "admin", device: "desktop", pages: [["08-admin-overview", "/admin"], ["09-admin-users", "/admin/users"], ["10-admin-rates", "/admin/rates"], ["11-admin-support", "/admin/support"], ["12-admin-audit", "/admin/audit"]] },
  { user: "owner", device: "desktop", pages: [["13-costmaster", "/costs"]] },
  { user: "it.support", device: "desktop", pages: [["14-it-system", "/system"]] },
];

function lastWeek() {
  const d = new Date();
  const dow = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dow - 7);
  return d.toISOString().slice(0, 10);
}

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext(s.device === "phone" ? devices["Pixel 7"] : { viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("Username").fill(s.user);
  await page.getByLabel("PIN").fill(PIN);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  for (const [name, path] of s.pages) {
    if (path === "REVIEW") {
      await page.goto(`${BASE}/team`);
      await page.getByRole("link", { name: /Pat Doyle/ }).first().click();
      await page.getByRole("heading", { name: "Pat Doyle" }).waitFor();
    } else {
      await page.goto(BASE + path.replace("LASTWEEK", lastWeek()));
    }
    await page.waitForLoadState("networkidle");
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log("saved", name);
  }
  await ctx.close();
}
await browser.close();
