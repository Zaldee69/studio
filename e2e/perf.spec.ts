import { execFileSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { jktDate } from "../src/lib/domain/format";
import { apiAs, login } from "./helpers";

// Kinerja Analitik dengan riwayat 12 bulan (±10.000 transaksi dari npm run seed:analytics). Jalan terakhir di proyek
// hp-390 karena menambah banyak data. Diukur 3× dan diambil tercepat (mesin lokal berisik).
test("kinerja · 12 bulan ±10.000 transaksi → 30 hari < 2 dtk, Bulan lalu (MV) < 1 dtk", async ({ page }) => {
  test.setTimeout(240_000);
  execFileSync("npm", ["run", "seed:analytics"], { stdio: "ignore", timeout: 180_000 }); // sinkron → batasi agar worker tidak macet
  const m = await apiAs("manager");
  const today = jktDate();
  const add = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  const lastEnd = add(`${today.slice(0, 7)}-01`, -1);
  const best = async (from: string, to: string) => {
    let t = Infinity, tx = 0;
    for (let i = 0; i < 3; i++) {
      const s = performance.now();
      const { data, error } = await m.rpc("kpi_dashboard", { p_from: from, p_to: to });
      expect(error).toBeNull();
      t = Math.min(t, performance.now() - s);
      tx = data.summary.current.tx_count;
    }
    return { t, tx };
  };
  const d30 = await best(add(today, -29), today);
  const last = await best(`${lastEnd.slice(0, 7)}-01`, lastEnd);
  console.log(`kpi_dashboard 30 hari: ${Math.round(d30.t)} ms (${d30.tx} tx) · bulan lalu: ${Math.round(last.t)} ms (${last.tx} tx)`);
  expect(d30.tx).toBeGreaterThan(300);
  expect(d30.t).toBeLessThan(2000);
  expect(last.t).toBeLessThan(1000);

  await login(page, "manager");
  let ttfb = Infinity;
  for (let i = 0; i < 3; i++) {
    await page.goto("/manajer/analitik?periode=30");
    await expect(page.getByRole("link", { name: /^Omzet/ })).toBeVisible();
    ttfb = Math.min(ttfb, await page.evaluate(() => { const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming; return n.responseStart - n.requestStart; }));
  }
  console.log(`halaman Analitik 30 hari (server): ${Math.round(ttfb)} ms`);
  expect(ttfb).toBeLessThan(2000);
});
