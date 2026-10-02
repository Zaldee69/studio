// AlertDialog pengganti window.confirm(): bisa dipakai di dalam Sheet (<dialog> modal) & alur form (requestSubmit).
import { expect, test } from "@playwright/test";
import { card, login, sql } from "./helpers";

test("konfirmasi: Esc & batal, juga di atas Sheet modal", async ({ page }) => {
  await login(page, "manager");
  await page.goto("/manajer/pengaturan?tab=layanan");
  await page.getByRole("button", { name: "Hapus" }).first().click();
  const ad = page.getByRole("alertdialog", { name: "Hapus baris ini?" });
  await expect(ad).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(ad).toBeHidden();

  const [a] = sql<{ id: string; cid: string }>(`with c as (insert into customers (name) values ('Uji Alert') returning id),
    ap as (insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source)
      select c.id, r.id, st.id, date_trunc('hour', now()) - interval '1 hour', 30, 'admin' from c,
        (select id from resources where type='barbershop' and active order by sort limit 1) r,
        (select id from staff where category='barbershop' and active order by sort limit 1) st returning id, customer_id)
    select id, customer_id cid from ap`);
  try {
  await page.goto("/manajer/jadwal");
  await card(page, "Uji Alert").first().click();
  await page.getByRole("button", { name: "Tidak datang" }).click();
  const nd = page.getByRole("alertdialog", { name: "Tandai pelanggan tidak datang?" });
  await expect(nd).toBeVisible();
  await nd.getByRole("button", { name: "Batal" }).click(); // tombol bisa diklik di atas Sheet modal
  await expect(nd).toBeHidden();
  await expect(page.getByRole("button", { name: "Tidak datang" })).toBeVisible(); // Sheet tetap terbuka
  } finally {
    sql(`with d as (delete from appointments where id = '${a.id}') delete from customers where id = '${a.cid}'`);
  }
});

test("konfirmasi hapus: batal tidak menghapus, setuju menghapus", async ({ page }) => {
  sql(`insert into services (name, category, price, duration_min, sort) values ('Uji Hapus', 'barbershop', 1000, 10, 999)`);
  try {
    await login(page, "manager");
    await page.goto("/manajer/pengaturan?tab=layanan");
    const row = page.locator("form", { has: page.locator('input[value="Uji Hapus"]') });
    await row.getByRole("button", { name: "Hapus" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Batal" }).click();
    await expect(row).toBeVisible(); // batal → tidak terhapus
    await row.getByRole("button", { name: "Hapus" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Hapus" }).click();
    await expect(row).toHaveCount(0);
    expect(sql(`select 1 from services where name = 'Uji Hapus'`)).toHaveLength(0);
  } finally {
    sql(`delete from services where name = 'Uji Hapus'`);
  }
});
