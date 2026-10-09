import { expect, test } from "@playwright/test";
import { withFakeWablas } from "./fake-wablas";
import { admin, randomWa, sql, uniq } from "./helpers";

// Jalur lengkap: booking sebagai tamu (nama + WA) → masuk akun dengan nomor WA yang sama (kode lewat WhatsApp tiruan)
// → booking tamu, nama, & saldo langsung tampil di akun. Tanpa email & kata sandi.
const wa = withFakeWablas(test);
const H4 = new Date(Date.now() + 4 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Asia/Jakarta" });

test("tamu booking → masuk dengan WA yang sama → booking & saldo tamu tampil di akun", async ({ page }) => {
  const name = `Tamu Lalu Daftar ${uniq()}`, wa08 = randomWa(), wa62 = "62" + wa08.slice(1);
  const [{ data: svc }, { data: staff }] = await Promise.all([
    admin.from("services").select("id").eq("name", "Potong Rambut").single(),
    admin.from("staff").select("id").eq("name", "Dimas").single(),
  ]);

  // slot tetap (H+4 15.30, Dimas) — lepaskan bila terisi run sebelumnya
  sql(`update appointments set status = 'cancelled', cancel_reason = 'reset tes' where staff_id = '${staff!.id}'
    and start_at < jkt('${H4}', '16:30') and end_at > jkt('${H4}', '15:00') and status not in ('paid', 'cancelled')`);

  // 1. booking sebagai tamu
  await page.goto(`/booking?langkah=konfirmasi&layanan=${svc!.id}&staf=barbershop:${staff!.id}&tgl=${H4}&jam=15:30`);
  await page.fill("#g-name", name);
  await page.fill("#g-wa", wa08);
  await page.getByLabel(/Saya menyetujui/).check();
  await page.getByRole("button", { name: /^Konfirmasi/ }).first().click();
  await expect(page.getByText("Booking terkonfirmasi")).toBeVisible();
  // saldo deposit dari top-up di kasir (sebagai tamu)
  const [{ id: cid }] = sql<{ id: string }>(`select id from customers where whatsapp = '${wa62}'`);
  sql(`insert into deposit_topups (customer_id, amount_paid, amount_credited, method) values ('${cid}', 200000, 200000, 'cash')`);

  // 2. masuk akun dengan nomor yang sama — tanpa ditanya nama (sudah tercatat saat booking)
  await page.goto("/akun");
  await page.fill("#c-wa", wa08);
  await page.getByRole("button", { name: "Kirim kode ke WhatsApp" }).click();
  await expect(page.getByRole("status")).toContainText(`+${wa62}`);
  await page.fill("#c-code", "000000");
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Kode salah" })).toBeVisible();
  await page.fill("#c-code", await wa.code(wa62));
  await page.getByRole("button", { name: "Masuk", exact: true }).click();

  // 3. booking & saldo tamu sudah di akun
  await expect(page.getByRole("heading", { name: `Halo, ${name.split(" ")[0]}.` })).toBeVisible();
  await expect(page.getByText(wa62, { exact: true })).toBeVisible();
  await expect(page.getByText("Rp200.000")).toBeVisible();
  await expect(page.getByText("Potong Rambut").first()).toBeVisible(); // booking mendatang dari saat jadi tamu
  const [link] = sql<{ same: boolean }>(`select p.customer_id = '${cid}' as same from profiles p join auth.users u on u.id = p.id where u.phone = '${wa62}'`);
  expect(link.same).toBe(true);
  // kode tidak tersimpan setelah terkirim (manajer pun tak bisa membacanya)
  expect(sql(`select 1 from outbound_messages where template = 'otp' and to_address = '${wa62}' and body is not null and status = 'sent'`)).toHaveLength(0);
});

test("nomor baru → akun baru ditanya nama sekali", async ({ page }) => {
  const wa08 = randomWa(), wa62 = "62" + wa08.slice(1), name = `Baru ${uniq()}`;
  await page.goto("/akun");
  await page.fill("#c-wa", wa08);
  await page.getByRole("button", { name: "Kirim kode ke WhatsApp" }).click();
  await page.fill("#c-code", await wa.code(wa62));
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.getByLabel("Nama").fill(name);
  await page.getByRole("button", { name: "Simpan & lanjut" }).click();
  await expect(page.getByRole("heading", { name: `Halo, ${name.split(" ")[0]}.` })).toBeVisible();
  const [c] = sql<{ name: string; whatsapp: string }>(`select c.name, c.whatsapp from profiles p join auth.users u on u.id = p.id join customers c on c.id = p.customer_id where u.phone = '${wa62}'`);
  expect(c).toEqual({ name, whatsapp: wa62 });
});
