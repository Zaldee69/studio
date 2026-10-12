import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Laporan mingguan owner: angka otomatis + catatan manajer (A, G, H, I) → tampil di laporan cetak.
test("laporan mingguan: isi catatan manajer → tampil di laporan, siap dicetak", async ({ page }) => {
  await login(page, "manager");
  await page.goto("/manajer/analitik/laporan?periode=minggu&nilai=2026-10-05");
  const report = page.getByRole("article", { name: "Laporan owner" });
  await expect(report.getByRole("heading", { name: "Laporan Mingguan Owner" })).toBeVisible();
  for (const h of ["A. Ringkasan eksekutif", "B. Kinerja bisnis", "C. Kinerja per layanan", "D. Ringkasan keuangan", "E. Orang & operasional",
    "F. Pemasaran", "G. Masalah utama & tindakan korektif", "H. Keputusan yang dibutuhkan dari owner", "I. Prioritas minggu berikutnya"])
    await expect(report.getByRole("heading", { name: h })).toBeVisible();
  await expect(report.getByRole("heading", { name: /J\. Pelanggan/ })).toHaveCount(0); // bagian bulanan tidak di laporan mingguan
  await expect(report).toContainText("Laba/rugi operasional");
  await expect(report).not.toContainText("Laba bersih");

  const notes = page.getByRole("region", { name: "Catatan manajer" });
  await notes.getByLabel(/A\. Ringkasan eksekutif/).fill("Minggu pertama operasional penuh; omzet barbershop stabil.");
  await notes.getByRole("button", { name: "+ Tambah" }).first().click();
  await notes.getByLabel("Masalah", { exact: true }).fill("Durasi potong terjadwal terlalu panjang");
  await notes.getByLabel("Tindakan & cara mengukur hasil").fill("Durasi diubah 30 menit; pantau bentrok palsu = 0");
  await notes.getByLabel("Tidak ada keputusan owner yang mendesak").check();
  await notes.getByRole("button", { name: "Simpan catatan" }).click();
  await expect(page.getByText("Catatan laporan disimpan")).toBeVisible();

  await expect(report).toContainText("Minggu pertama operasional penuh");
  await expect(report.getByRole("table").filter({ hasText: "Durasi potong terjadwal terlalu panjang" })).toBeVisible();
  await expect(report).toContainText("Tidak ada keputusan owner yang mendesak.");
  await page.emulateMedia({ media: "print" });
  await expect(notes).toBeHidden(); // editor tidak ikut tercetak
  sql(`delete from owner_report_notes where kind = 'minggu' and period_start = '2026-10-05'`);
});
