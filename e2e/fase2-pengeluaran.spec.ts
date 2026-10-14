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

// Pengeluaran rutin bulanan: tambah templat → "Catat" (form terisi) → status "Dicatat".
test("pengeluaran rutin: tambah IPL → catat dari templat → dicatat bulan ini", async ({ page }) => {
  const name = `IPL ${uniq()}`;
  try {
    await login(page, "manager");
    await page.goto("/manajer/pengeluaran");
    const rutin = page.getByRole("region", { name: "Pengeluaran rutin bulanan" });
    await rutin.getByRole("button", { name: "+ Tambah rutin" }).click();
    await page.getByLabel("Kategori").selectOption("ipl");
    await page.getByLabel("Keterangan").fill(name);
    await page.getByLabel("Perkiraan jumlah (Rp)").fill("75000");
    await page.getByLabel("Jatuh tempo tiap tanggal").fill("1");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(page.getByText("Pengeluaran rutin ditambahkan")).toBeVisible();
    const row = rutin.locator("div", { hasText: name }).last();
    await row.getByRole("button", { name: /Catat/ }).click();
    await expect(page.getByLabel("Keterangan")).toHaveValue(name);
    await expect(page.getByLabel("Jumlah (Rp)")).toHaveValue("75.000");
    await page.getByRole("button", { name: "Simpan" }).click();
    await expect(rutin.locator("div", { hasText: name }).last()).toContainText("Dicatat");
  } finally {
    sql(`update expenses set voided_at = now(), void_reason = 'e2e' where description = '${name}'`);
    sql(`update expense_templates set active = false where description = '${name}'`);
  }
});
