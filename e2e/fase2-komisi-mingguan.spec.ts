import { expect, test } from "@playwright/test";
import { login, newSession, sql, uniq } from "./helpers";

// Komisi mingguan: manajer menutup minggu → menandai dibayar → gaji bulanan mengurangkan yang sudah dibayar mingguan.
// Minggu acak di 2020 (tanpa data lain & gaji bulan itu belum ditutup); dibersihkan di akhir.
test("tutup minggu → tandai dibayar → gaji bulanan: dibayar mingguan & sisa akhir bulan", async ({ page, browser }, info) => {
  const offset = Math.floor(Math.random() * 40);
  const [{ w }] = sql<{ w: string }>(`select (date '2020-01-06' + ${offset} * 7)::text as w`); // Senin
  const name = `Minggu ${uniq()}`;
  const [{ id }] = sql<{ id: string }>(`insert into staff (name, category, commission_pct_override) values ('${name}', 'barbershop', 50) returning id`);
  sql(`with t as (insert into transactions (subtotal, total, paid_amount, payment_method, created_at)
         values (100000, 100000, 100000, 'cash', jkt(date '${w}' + 2, '10:00')) returning id)
       insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) select t.id, '${id}', 'Potong', 'barbershop', 100000, 100000 from t`);
  const month = sql<{ m: string }>(`select to_char(date '${w}' + 2, 'YYYY-MM') as m`)[0].m;
  try {
    await login(page, "manager");
    await page.goto(`/manajer/sdm?tab=mingguan&minggu=${w}`);
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("Rp50.000");
    await expect(row).toContainText("Belum final");
    await page.getByRole("button", { name: "Tutup minggu" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Tutup minggu" }).click();
    await expect(page.getByText("Minggu ditutup — angka final")).toBeVisible();

    await row.getByRole("button", { name: "Tandai dibayar" }).click();
    await page.getByRole("button", { name: "Dibayar transfer" }).click();
    await expect(row).toContainText(/Dibayar .* · transfer/);
    await expect(page.getByRole("button", { name: "Buka ulang" })).toBeDisabled(); // sudah ada yang dibayar

    await page.goto(`/manajer/sdm?tab=bulanan&bulan=${month}`);
    await expect(page.getByRole("columnheader", { name: "Dibayar mingguan" })).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(name) })).toContainText("−Rp50.000");

    // capster melihat bagian komisi mingguannya sendiri
    const k = await newSession(browser, info, "andi", { width: 390, height: 844 });
    await k.goto("/kapster/komisi");
    await expect(k.getByRole("region", { name: "Komisi mingguan" })).toContainText("Minggu ini · berjalan");
    await k.context().close();
  } finally {
    sql(`delete from commission_weeks where week_start = '${w}'`);
    sql(`update staff set active = false where id = '${id}'`);
  }
});

// Kasbon dipotong di komisi mingguan + slip gaji mingguan (cetak/PDF & WhatsApp).
test("kasbon dipotong mingguan → slip gaji mingguan", async ({ page }) => {
  const offset = 40 + Math.floor(Math.random() * 40);
  const [{ w }] = sql<{ w: string }>(`select (date '2020-01-06' + ${offset} * 7)::text as w`);
  const name = `Kasbon ${uniq()}`;
  const [{ id }] = sql<{ id: string }>(`insert into staff (name, category, commission_pct_override) values ('${name}', 'barbershop', 50) returning id`);
  sql(`with t as (insert into transactions (subtotal, total, paid_amount, payment_method, created_at)
         values (100000, 100000, 100000, 'cash', jkt(date '${w}' + 2, '10:00')) returning id)
       insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) select t.id, '${id}', 'Potong', 'barbershop', 100000, 100000 from t`);
  sql(`insert into expenses (date, category, description, amount, source, staff_id) values (date '${w}' + 1, 'kasbon', 'uji', 20000, 'laci', '${id}')`);
  try {
    await login(page, "manager");
    await page.goto(`/manajer/sdm?tab=mingguan&minggu=${w}`);
    const row = page.getByRole("row", { name: new RegExp(name) });
    await expect(row).toContainText("−Rp20.000");
    await expect(row).toContainText("Rp30.000");
    await row.getByRole("link", { name: "Slip" }).click();
    const slip = page.getByRole("article");
    await expect(slip).toContainText("Slip gaji mingguan");
    await expect(slip).toContainText("Potongan kasbon & koreksi−Rp20.000");
    await expect(slip).toContainText("DibayarRp30.000");
    await expect(slip).toContainText("Potong");
    await expect(page.getByRole("button", { name: "Cetak / PDF" })).toBeVisible();
  } finally {
    sql(`delete from expenses where staff_id = '${id}'`);
    sql(`update staff set active = false where id = '${id}'`);
  }
});
