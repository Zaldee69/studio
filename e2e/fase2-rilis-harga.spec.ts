import { expect, test } from "@playwright/test";
import { login, sql } from "./helpers";

// Rilis harga: draft pricelist tampil sebagai "menunggu rilis" di Pengaturan, belum muncul di kasir & booking.
test("harga baru menunggu rilis: tampil di Pengaturan, belum di kasir", async ({ page }) => {
  sql("update services set release_action = 'retire' where name = 'Potong Rambut' and active"); // di prod ditandai oleh migrasi; lokal seed dimuat sesudahnya
  await login(page, "manager");
  await page.goto("/manajer/pengaturan?tab=layanan");
  const panel = page.getByRole("region", { name: "Harga baru menunggu rilis" });
  await expect(panel).toContainText("Fresh Groom");
  await expect(panel.getByRole("row", { name: /Potong Rambut/ })).toContainText("Dihentikan");
  await expect(panel.getByRole("row", { name: /Essential Cut/ })).toContainText("Rp45.000");
  await expect(panel.getByRole("button", { name: "Rilis harga baru" })).toBeEnabled();
  await page.goto("/manajer/kasir");
  await expect(page.getByRole("button", { name: /^Tambah Potong Rambut/ }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Tambah Fresh Groom/ })).toHaveCount(0);
});
