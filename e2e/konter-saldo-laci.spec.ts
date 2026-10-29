import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Saldo laci berjalan: manajer atur saldo awal di Pengaturan → tampil di rekap tutup kasir & masuk kas diharapkan.
test("saldo awal laci dari Pengaturan → rekap tutup kasir", async ({ page }) => {
  const [orig] = sql<{ d: string | null; b: number }>(`select drawer_start_date::text as d, drawer_start_balance as b from settings`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/pengaturan?tab=keuangan");
    await page.getByLabel("Saldo awal laci berlaku mulai tanggal").fill(sql<{ d: string }>(`select jkt_today()::text as d`)[0].d);
    await page.getByLabel("Saldo awal laci pada tanggal itu (Rp)").fill("502000");
    await page.getByRole("button", { name: "Simpan pengaturan" }).click();
    await expect(page.getByText("Pengaturan tersimpan")).toBeVisible();
    sql(`do $$ begin alter table cash_closings disable trigger cash_closings_immutable;
      delete from cash_closings where date = jkt_today(); alter table cash_closings enable trigger cash_closings_immutable; end $$`);
    await page.goto("/manajer/kasir?tab=tutup");
    const main = page.getByRole("main");
    await expect(main.getByText("Saldo awal laci (sisa tutup kasir sebelumnya)").locator("..")).toContainText("Rp502.000");
    await expect(main.getByLabel(/Disetor ke brankas \/ owner/)).toBeVisible();
  } finally {
    sql(`update settings set drawer_start_date = ${orig.d ? `'${orig.d}'` : "null"}, drawer_start_balance = ${orig.b}`);
  }
});

// Tutup kasir per pecahan: jumlah lembar + koin → total laci otomatis; rincian tersimpan & tampil di rekap.
test("tutup kasir: hitung per pecahan → tersimpan dengan rincian", async ({ page }) => {
  sql(`do $$ begin alter table cash_closings disable trigger cash_closings_immutable;
    delete from cash_closings where date = jkt_today(); alter table cash_closings enable trigger cash_closings_immutable; end $$`);
  await login(page, "manager");
  await page.goto("/manajer/kasir?tab=tutup");
  const main = page.getByRole("main");
  await main.getByLabel("Hitung per pecahan (disarankan)").check();
  await main.getByLabel("Jumlah lembar 100rb").fill("2");
  await main.getByLabel("Jumlah lembar 5rb").fill("3");
  await main.getByLabel("Koin").fill("2000");
  await expect(main.getByText("Total uang di laci").locator("..")).toContainText("Rp217.000");
  await main.getByRole("button", { name: "Simpan tutup kasir" }).click();
  await expect(page.getByText("Tutup kasir tersimpan")).toBeVisible();
  await expect(main).toContainText("Per pecahan: 100rb×2 · 5rb×3 · koin Rp2.000");
  expect(sql<{ p: number }>(`select physical_cash as p from cash_closings where date = jkt_today() order by created_at desc limit 1`)[0].p).toBe(217000);
});
