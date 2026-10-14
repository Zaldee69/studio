import { expect, test } from "@playwright/test";
import { newSession, randomWa, sql, uniq } from "./helpers";

// Voucher: pelanggan memasukkan kode saat booking → estimasi berubah → booking menyimpan voucher → kasir memotong saat bayar.
test("voucher booking online: kode salah ditolak, kode benar dipakai & terpotong di kasir", async ({ browser }, info) => {
  const code = `E2E${uniq().toUpperCase()}`;
  sql(`insert into vouchers (code, kind, value, category, once_per_customer) values ('${code}', 'amount', 15000, 'barbershop', true)`);
  const name = `Voucher ${uniq()}`;
  try {
    const ctx = await browser.newContext({ ...info.project.use, extraHTTPHeaders: { "x-forwarded-for": `10.8.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}` } });
    const p = await ctx.newPage();
    await p.goto("/booking?kategori=barbershop");
    await p.getByRole("button", { name: /Potong Rambut/ }).first().click();
    await p.getByRole("button", { name: /^Lanjut/ }).first().click();
    await p.getByRole("button", { name: /^Lanjut/ }).first().click(); // staf: siapa saja
    await p.locator("button[aria-pressed][aria-label]").nth(3).click(); // H+3
    await p.locator("button[aria-pressed]:not([aria-label])", { hasText: /^\d\d:\d\d$/ }).first().click();
    await p.getByRole("button", { name: /^Lanjut/ }).first().click();

    await p.fill("#b-voucher", "SALAH123");
    await p.getByRole("button", { name: "Pakai" }).click();
    await expect(p.getByRole("alert").filter({ hasText: "Kode voucher tidak dikenal" })).toBeVisible();
    await p.fill("#b-voucher", code.toLowerCase());
    await p.getByRole("button", { name: "Pakai" }).click();
    await expect(p.getByRole("status").filter({ hasText: `Voucher ${code}` })).toBeVisible();
    await expect(p.getByText(`Estimasi potongan voucher ${code}`).first()).toBeVisible();

    await p.fill("#g-name", name);
    await p.fill("#g-wa", randomWa());
    await p.getByLabel(/Saya menyetujui/).check();
    await p.getByRole("button", { name: /^Konfirmasi/ }).first().click();
    await expect(p.getByText("Booking terkonfirmasi")).toBeVisible();
    expect(sql(`select 1 from booking_groups g join vouchers v on v.id = g.voucher_id where v.code = '${code}'`)).toHaveLength(1);
    await ctx.close();

    // kasir: tagihan booking itu (dijadikan selesai hari ini) → potongan voucher
    sql(`update appointments set start_at = jkt(jkt_today(), '07:00'), status = 'completed'
         where booking_group_id = (select g.id from booking_groups g join vouchers v on v.id = g.voucher_id where v.code = '${code}')`);
    const k = await newSession(browser, info, "cashier", { width: 1366, height: 768 });
    await k.goto("/kasir/kasir");
    await k.getByRole("region", { name: "Tagihan dari booking hari ini" }).getByRole("button", { name: new RegExp(name) }).click();
    await expect(k.getByRole("region", { name: "Keranjang" })).toContainText(`Voucher ${code}`);
    await k.context().close();
  } finally {
    sql(`update appointments set status = 'cancelled', cancel_reason = 'e2e' where booking_group_id in (select g.id from booking_groups g join vouchers v on v.id = g.voucher_id where v.code = '${code}')`);
    sql(`update vouchers set active = false where code = '${code}'`);
  }
});
