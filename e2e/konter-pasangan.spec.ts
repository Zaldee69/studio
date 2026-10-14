import { expect, test } from "@playwright/test";
import { login, sql, uniq } from "./helpers";

// Pasangan/rombongan (satu kode booking): kasir melihat tanda 👥 yang sama & diingatkan menambahkan pasangannya.
test("tagihan pasangan: tanda grup sama → pilih satu → 'Tambahkan juga' memasukkan pasangannya", async ({ page }) => {
  const a = `Pasangan ${uniq()}`, b = `Pasangan ${uniq()}`;
  sql(`with g as (insert into booking_groups (code, source) values ('E2E${uniq().toUpperCase()}', 'online') returning id),
    c as (insert into customers (name) values ('${a}'), ('${b}') returning id, name)
    insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status, booking_group_id)
    select c.id, (select id from resources where name = case when c.name = '${a}' then 'Kursi Barber 1' else 'Kursi Barber 2' end),
           case when c.name = '${a}' then '00000000-0000-0000-0001-000000000001'::uuid else null end,
           jkt(jkt_today(), '08:00'), 30, 'online', 'completed', g.id from c, g`);
  sql(`insert into appointment_services (appointment_id, service_id)
    select a.id, (select id from services where name = 'Potong Rambut') from appointments a join customers c on c.id = a.customer_id where c.name in ('${a}', '${b}')`);
  try {
    await login(page, "cashier");
    const tagihan = page.getByRole("region", { name: "Tagihan dari booking hari ini" });
    const ca = tagihan.getByRole("button", { name: new RegExp(a) }), cb = tagihan.getByRole("button", { name: new RegExp(b) });
    const tag = await ca.getByLabel(/^Rombongan/).getAttribute("aria-label");
    expect(tag).toMatch(/Rombongan [A-Z], 2 orang/);
    await expect(cb.getByLabel(tag!)).toBeVisible();
    await ca.click();
    await expect(tagihan.getByRole("note")).toContainText(b);
    await tagihan.getByRole("button", { name: "Tambahkan juga" }).click();
    await expect(cb).toHaveAttribute("aria-pressed", "true");
    await expect(tagihan.getByRole("note")).toHaveCount(0);
  } finally {
    sql(`update appointments set status = 'cancelled', cancel_reason = 'e2e' where customer_id in (select id from customers where name in ('${a}', '${b}'))`);
  }
});
