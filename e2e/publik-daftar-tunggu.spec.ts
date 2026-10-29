import { expect, test } from "@playwright/test";

// Lini "Segera hadir" → daftar tunggu. Jalur simpan (DB) diuji di pgTAP 49; di sini tanpa menulis data (tidak memicu notifikasi).
test("kartu Nail Art → daftar tunggu: minat terpilih, nomor salah ditolak", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("region", { name: "Barbershop, Nail Art, dan Lashes" }).getByRole("link", { name: "Segera hadir · Daftar tunggu" }).first().click();
  await expect(page).toHaveURL(/\/daftar-tunggu\?minat=nail/);
  await expect(page.getByRole("heading", { name: "Nail Art" })).toBeVisible();
  await expect(page.getByLabel("Nail Art")).toBeChecked();
  await expect(page.getByLabel("Lashes")).not.toBeChecked();
  await page.getByLabel("Nama").fill("Dion");
  await page.getByLabel("No. WhatsApp").fill("0812");
  await page.getByRole("button", { name: "Daftar tunggu" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "No. WhatsApp tidak valid" })).toBeVisible();
});
