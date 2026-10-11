import { expect, test } from "@playwright/test";
import { login, sql, uniq } from "./helpers";

// Tips QRIS: satu kali scan (tagihan + tips), tips untuk staf pilihan kasir, bukan omzet; tercetak di struk.
test("bayar QRIS + tips → struk menampilkan tips & total QRIS, omzet tidak termasuk tips; filter riwayat", async ({ page }) => {
  const ref = `TIP${uniq()}`.toUpperCase();
  await login(page, "cashier");
  const cart = page.getByRole("region", { name: "Keranjang" });
  await page.getByRole("button", { name: /^Tambah Cukur Jenggot/ }).first().click();
  const staff = cart.getByRole("combobox", { name: /Kapster untuk Cukur Jenggot/ });
  await staff.selectOption({ index: 1 });
  const staffName = (await staff.locator("option:checked").innerText()).trim();
  await cart.getByRole("radio", { name: "QRIS" }).click();
  await cart.getByLabel("No. referensi QRIS").fill(ref);
  await cart.getByLabel("Tips (opsional)").fill("20000");
  await expect(cart.getByRole("combobox", { name: "Tips untuk" })).toHaveValue(/.+/); // default: staf di keranjang
  await expect(cart).toContainText(/Total scan QRIS\s*Rp\d/);
  await page.getByRole("button", { name: /^Catat pembayaran/ }).click();
  await expect(cart).toContainText("Pembayaran tercatat");
  await expect(cart).toContainText(`Tips untuk ${staffName}Rp20.000`);
  await expect(cart).toContainText("Total QRIS");

  const [t] = sql<{ total: number; tip_amount: number; price: number }>(`select t.total, t.tip_amount,
    (select price from services where name = 'Cukur Jenggot') as price from transactions t where t.qris_ref = '${ref}'`);
  expect(Number(t.tip_amount)).toBe(20000);
  expect(Number(t.total)).toBe(Number(t.price)); // omzet = harga layanan saja

  // riwayat: filter No. struk + metode + staf → hanya transaksi ini
  const [{ no }] = sql<{ no: string }>(`select upper(left(id::text, 8)) as no from transactions where qris_ref = '${ref}'`);
  await page.goto("/kasir/kasir?tab=riwayat");
  await page.getByLabel("Cari pelanggan atau No. struk").fill(`#${no}`);
  await page.getByLabel("Metode bayar").selectOption("qris");
  await page.getByLabel("Staf").selectOption({ label: staffName });
  await page.getByLabel("Layanan").selectOption("Cukur Jenggot");
  await expect(page.getByText(/^1 dari \d+$/)).toBeVisible();
  await page.getByLabel("Metode bayar").selectOption("cash");
  await expect(page.getByText("Tidak ada transaksi yang cocok dengan filter.")).toBeVisible();
});
