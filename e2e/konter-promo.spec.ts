import { expect, test } from "@playwright/test";
import { login, newSession, sql, uniq } from "./helpers";

// Promo booking online: manajer menyalakan di Pengaturan → banner publik → booking online dibayar di kasir dapat diskon
// otomatis; walk-in tidak.
const today = () => sql<{ d: string }>("select jkt_today()::text as d")[0].d;

function booking(name: string, source: "online" | "walk_in", chair: string) {
  sql(`with c as (insert into customers (name) values ('${name}') returning id)
    insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status)
    select c.id, (select id from resources where name = '${chair}'), '00000000-0000-0000-0001-000000000001',
           jkt(jkt_today(), '10:00'), 30, '${source}', 'completed' from c`); // 10.00: tidak bentrok slot tes lain (15–19)
  sql(`insert into appointment_services (appointment_id, service_id)
    select a.id, (select id from services where name = 'Potong Rambut') from appointments a join customers c on c.id = a.customer_id where c.name = '${name}'`);
}

test("promo booking online 10%: diatur manajer → banner → kasir otomatis diskon booking online, walk-in tidak", async ({ page, browser }, info) => {
  const d = today();
  // pengaturan promo yang sedang dipakai di DB lokal dikembalikan setelah tes
  const [orig] = sql<{ pct: number; start: string | null; end: string | null }>(
    "select online_promo_pct as pct, online_promo_start::text as start, online_promo_end::text as end from settings");
  sql("update settings set online_promo_pct = 0, online_promo_start = null, online_promo_end = null");
  const m = await newSession(browser, info, "manager");
  try {
    await m.goto("/manajer/pengaturan?tab=publik");
    await m.getByLabel("Diskon booking online (%) — 0 = promo mati").fill("10");
    await m.getByRole("button", { name: "Simpan halaman publik" }).click();
    await expect(m.getByText(/isi tanggal mulai & selesai/)).toBeVisible(); // promo aktif wajib punya periode
    // ponytail: formulir Pengaturan kembali ke nilai tersimpan setelah ditolak — isi ulang
    await m.getByLabel("Diskon booking online (%) — 0 = promo mati").fill("10");
    await m.getByLabel("Berlaku untuk booking yang dibuat mulai").fill(d);
    await m.getByLabel("sampai dengan").fill(d);
    await m.getByRole("button", { name: "Simpan halaman publik" }).click();
    await expect(m.getByText("Halaman publik diperbarui")).toBeVisible();

    await page.goto("/");
    await expect(page.getByRole("link", { name: /Diskon 10% untuk booking online/ })).toBeVisible();

    const online = `Promo ${uniq()}`, walkin = `Walkin ${uniq()}`;
    booking(online, "online", "Kursi Barber 1");
    booking(walkin, "walk_in", "Kursi Barber 2");
    await login(page, "cashier");
    const cart = page.getByRole("region", { name: "Keranjang" });
    await page.getByRole("button", { name: new RegExp(walkin) }).click();
    await expect(cart).toContainText("Potong Rambut");
    await expect(cart).not.toContainText("Promo booking online");
    await page.getByRole("button", { name: new RegExp(walkin) }).click(); // keluarkan dari keranjang
    await page.getByRole("button", { name: new RegExp(online) }).click();
    await expect(cart).toContainText("Promo booking online 10%");
    await expect(cart).toContainText("−Rp7.500");
    await page.getByRole("button", { name: /Catat pembayaran · Rp67\.500/ }).click();
    await expect(page.getByRole("heading", { name: "Pembayaran tercatat" })).toBeVisible();
    const [tx] = sql<{ discount_amount: number; discount_label: string }>(`select t.discount_amount, t.discount_label from transactions t
      join customers c on c.id = t.customer_id where c.name = '${online}'`);
    expect(tx).toEqual({ discount_amount: 7500, discount_label: "Promo booking online 10%" });
  } finally {
    const q = (v: string | null) => (v ? `'${v}'` : "null");
    sql(`update settings set online_promo_pct = ${orig.pct}, online_promo_start = ${q(orig.start)}, online_promo_end = ${q(orig.end)}`);
    await m.context().close();
  }
});
