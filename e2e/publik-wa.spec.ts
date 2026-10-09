import { expect, test } from "@playwright/test";
import { startFakeWablas } from "./fake-wablas";
import { PW, randomWa, sql, uniq } from "./helpers";

// Tamu pernah booking dengan nomor WA → mendaftar akun → verifikasi nomor (kode OTP lewat Wablas tiruan) →
// riwayat booking tamu tersambung ke akun.
const wablas = startFakeWablas();
const sent = wablas.sent;
test.beforeAll(wablas.listen);
test.afterAll(wablas.close);

test("tamu → daftar akun → verifikasi WA dengan kode → riwayat tamu tersambung", async ({ page }) => {
  const wa = randomWa(), wa62 = "62" + wa.slice(1), name = `Tamu WA ${uniq()}`, email = `wa-${uniq()}@pelanggan.test`;
  sql(`with c as (insert into customers (name, whatsapp) values ('${name}', '${wa62}') returning id)
    insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status)
    select c.id, (select id from resources where name = 'Kursi Barber 1'), '00000000-0000-0000-0001-000000000001',
           jkt(jkt_today() - 3, '10:00'), 30, 'online', 'completed' from c`);
  // akun baru (email terkonfirmasi), nomor WA diisi saat daftar tapi belum terverifikasi
  const key = process.env.SUPABASE_SECRET_KEY!;
  const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ email, password: PW, email_confirm: true, user_metadata: { full_name: "Budi WA", whatsapp: wa62 } }),
  });
  expect(res.ok).toBe(true);

  await page.goto("/akun");
  await page.fill("#c-email", email); await page.fill("#c-pw", PW);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  const box = page.getByRole("region", { name: "Verifikasi nomor WhatsApp" });
  await expect(box.getByLabel("No. WhatsApp")).toHaveValue(wa); // terisi dari formulir daftar
  await box.getByRole("button", { name: "Kirim kode" }).click();
  await expect(box.getByRole("status")).toContainText(`+${wa62}`);
  const otp = sent.findLast((m) => m.phone === wa62)!;
  expect(otp).toMatchObject({ auth: "e2e.palsu", flag: "instant" });
  const code = otp.message.match(/\b(\d{6})\b/)![1];

  await box.getByLabel("Kode verifikasi").fill(code === "000000" ? "111111" : "000000");
  await box.getByRole("button", { name: "Verifikasi" }).click();
  await expect(box.getByRole("alert")).toHaveText("Kode salah.");
  await box.getByLabel("Kode verifikasi").fill(code);
  await box.getByRole("button", { name: "Verifikasi" }).click();
  await expect(page.getByText(/Riwayat booking & saldo dengan nomor ini sudah tersambung/)).toBeVisible();
  await expect(page.getByText(wa62, { exact: true })).toBeVisible(); // nomor tampil di bawah nama
  const [p] = sql<{ name: string }>(`select c.name from profiles p join customers c on c.id = p.customer_id where p.email = '${email}'`);
  expect(p.name).toBe(name); // akun memakai data pelanggan tamu (riwayat ikut)
});
