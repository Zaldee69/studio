import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// HP (<768px): rail diganti tab bar bawah (4 menu + "Lainnya"); file dinamai kapster-* agar ikut proyek hp-390.
test("HP manajer: tab bar bawah + Lainnya berisi sisa menu, menutup setelah pindah halaman", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 768, "≥768px memakai sidebar");
  await login(page, "manager");
  await page.goto("/manajer/jadwal");
  const nav = page.getByRole("navigation", { name: "Menu utama" });
  await expect(nav.getByRole("link")).toHaveText([/Beranda/, /Jadwal/, /Kasir/, /Pelanggan/]);
  await nav.getByRole("button", { name: /Lainnya/ }).click();
  const sheet = page.getByRole("dialog", { name: "Menu lainnya" });
  await expect(sheet.getByRole("link", { name: /Pengaturan/ })).toBeVisible();
  await sheet.getByRole("link", { name: /Inventaris/ }).click();
  await page.waitForURL(/\/manajer\/inventaris/);
  await expect(sheet).toBeHidden();
  await expect(nav.getByRole("button", { name: /Lainnya/ })).toHaveAttribute("aria-expanded", "false");
});
