import { expect, test } from "@playwright/test";
import { login, newSession, resetTodayClosings, sql, uniq } from "./helpers";

// Pengeluaran: kasir mencatat belanja kecil dari laci (≤ Rp100.000 tanpa nota) → manajer melihat & membatalkan dengan alasan.
test("kasir catat pengeluaran laci → manajer lihat & batalkan", async ({ page, browser }, info) => {
  resetTodayClosings(); // kasir hanya bisa mencatat sebelum tutup kasir hari ini
  const desc = `Galon ${uniq()}`;
  try {
    const k = await newSession(browser, info, "cashier");
    await k.goto("/kasir/pengeluaran");
    await k.getByRole("button", { name: "+ Catat pengeluaran" }).click();
    const form = k.getByRole("dialog", { name: "Catat pengeluaran" });
    await form.getByLabel("Kategori").selectOption("konsumsi");
    await form.getByLabel("Jumlah (Rp)").fill("150000");
    await expect(form.getByText("Foto nota (wajib)")).toBeVisible(); // di atas Rp100.000
    await form.getByLabel("Jumlah (Rp)").fill("25000");
    await expect(form.getByText("Foto nota (opsional)")).toBeVisible();
    await form.getByLabel("Keterangan").fill(desc);
    await form.getByRole("button", { name: "Simpan" }).click();
    await expect(k.getByText("Pengeluaran Rp25.000 tercatat")).toBeVisible();
    await expect(k.getByText(desc)).toBeVisible();
    await k.context().close();

    await login(page, "manager");
    await page.goto("/manajer/pengeluaran");
    const row = page.locator("div", { has: page.getByText(desc, { exact: true }) }).last();
    await expect(row).toContainText("Laci kas");
    await row.getByRole("button", { name: "Batalkan" }).click();
    await page.getByLabel("Alasan (wajib)").fill("uji e2e");
    await page.getByRole("button", { name: "Batalkan pengeluaran" }).click();
    await expect(page.getByText("Dibatalkan: uji e2e")).toBeVisible();
  } finally {
    sql(`delete from expenses where description = '${desc}'`);
  }
});
