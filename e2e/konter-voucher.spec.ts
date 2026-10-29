import { expect, test } from "@playwright/test";
import { login } from "./helpers";

// Sejak 28 Okt voucher hanya lewat booking online: kasir tidak punya kolom kode voucher, hanya keterangan.
test("kasir: tidak ada kolom kode voucher, ada keterangan booking online", async ({ page }) => {
  await login(page, "cashier");
  const cart = page.getByRole("region", { name: "Keranjang" });
  await page.getByRole("button", { name: /^Tambah Cukur Jenggot/ }).first().click();
  await expect(cart.getByLabel("Kode voucher")).toHaveCount(0);
  await expect(cart).toContainText("Kode voucher hanya berlaku lewat booking online");
});
