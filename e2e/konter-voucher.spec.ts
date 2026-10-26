import { expect, test } from "@playwright/test";
import { login, randomWa, sql, uniq } from "./helpers";

// Voucher di kasir (walk-in): berlaku hari ini, 1× per pelanggan → kasir wajib memilih pelanggan; potongan tercatat di transaksi.
test("kasir: kode voucher walk-in — wajib pilih pelanggan, potongan tercatat", async ({ page }) => {
  const code = `KSR${uniq().toUpperCase()}`;
  const name = `Voucher Kasir ${uniq()}`;
  sql(`insert into vouchers (code, kind, value, once_per_customer, weekdays)
       values ('${code}', 'amount', 5000, true, extract(isodow from jkt_today())::int::text)`);
  sql(`insert into customers (name, whatsapp) values ('${name}', '62${randomWa().slice(1)}')`);
  try {
    await login(page, "cashier");
    const cart = page.getByRole("region", { name: "Keranjang" });
    await page.getByRole("button", { name: /^Tambah Cukur Jenggot/ }).first().click();
    await cart.getByRole("combobox", { name: /Kapster untuk Cukur Jenggot/ }).selectOption({ index: 1 });

    await cart.getByLabel("Kode voucher").fill(code.toLowerCase());
    await cart.getByRole("button", { name: "Pakai", exact: true }).click();
    await expect(cart.getByRole("alert").filter({ hasText: "1× per pelanggan" })).toBeVisible();

    await cart.locator("#cart-cust").fill(name);
    await page.getByRole("option", { name: new RegExp(name) }).click();
    await cart.getByRole("button", { name: "Pakai", exact: true }).click();
    await expect(cart.getByText(`Voucher ${code}`).first()).toBeVisible();
    await expect(cart).toContainText("−Rp5.000");

    await page.getByRole("button", { name: /^Catat pembayaran/ }).click();
    await expect(cart).toContainText("Pembayaran tercatat");
    const [t] = sql<{ discount_amount: number; code: string }>(`select t.discount_amount, v.code from transactions t
      join vouchers v on v.id = t.voucher_id join customers c on c.id = t.customer_id where c.name = '${name}'`);
    expect(Number(t.discount_amount)).toBe(5000);
    expect(t.code).toBe(code);
  } finally {
    sql(`update vouchers set active = false where code = '${code}'`);
  }
});
