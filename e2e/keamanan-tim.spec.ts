import { expect, test } from "@playwright/test";
import { login, PW, SB, sql, svcKey, uniq } from "./helpers";

const code = () => sql<{ c: string }>("select invite_code as c from settings")[0].c;
/** Pendaftar tim lewat API admin Auth (alur form & email diuji di keamanan.spec). */
async function signup(name: string, confirmed: boolean) {
  const email = `${name.toLowerCase().replace(/\s/g, "")}-${uniq()}@contoh.test`;
  const r = await fetch(`${SB}/auth/v1/admin/users`, { method: "POST", headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: PW, email_confirm: confirmed, user_metadata: { signup: "team", invite_code: code(), role: "cashier", full_name: name } }) });
  if (!(await r.json()).id) throw new Error("gagal membuat pendaftar");
  return email;
}

test("persetujuan akun tim: email belum terverifikasi tidak bisa disetujui; setujui mengganti kode undangan; tolak menghapus", async ({ page }) => {
  const ok = `Kasir ${uniq()}`, belum = `Belum ${uniq()}`, tolak = `Tolak ${uniq()}`;
  await signup(ok, true); await signup(belum, false); await signup(tolak, true);
  const before = code();
  await login(page, "manager");
  await page.goto("/manajer/pengaturan?tab=akun");
  const panel = page.getByRole("region", { name: "Menunggu persetujuan" });
  await expect(panel.getByRole("row", { name: new RegExp(belum) })).toContainText("Belum diverifikasi");
  await expect(panel.getByRole("row", { name: new RegExp(belum) }).getByRole("button", { name: "Setujui" })).toBeDisabled();

  await panel.getByRole("row", { name: new RegExp(ok) }).getByRole("button", { name: "Setujui" }).click();
  await expect(page.getByText(/aktif\. Kode undangan sudah diganti/)).toBeVisible();
  expect(code()).not.toBe(before);

  await panel.getByRole("row", { name: new RegExp(tolak) }).getByRole("button", { name: "Tolak" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Tolak & hapus" }).click();
  await expect(page.getByText(`Pendaftaran ${tolak} ditolak`)).toBeVisible();
  expect(sql(`select 1 from profiles where full_name = '${tolak}'`)).toHaveLength(0);
});

test("hapus akun tim yang punya riwayat → dikunci, riwayat tetap", async ({ page }) => {
  const name = `Riwayat ${uniq()}`;
  const email = await signup(name, true);
  const [{ id }] = sql<{ id: string }>(`update profiles set active = true where full_name = '${name}' returning id`);
  sql(`insert into transactions (subtotal, total, paid_amount, payment_method, cashier_id, created_at) values (1000, 1000, 1000, 'cash', '${id}', now() - interval '400 days')`);
  await login(page, "manager");
  await page.goto("/manajer/pengaturan?tab=akun");
  await page.getByLabel("Hapus akun tim").selectOption({ label: `${name} · ${email}` });
  await page.getByRole("button", { name: "Hapus akun" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Hapus akun" }).click();
  await expect(page.getByText(/dikunci permanen/)).toBeVisible();
  expect(sql<{ a: boolean }>(`select active as a from profiles where id = '${id}'`)[0].a).toBe(false);
  expect(sql(`select 1 from transactions where cashier_id = '${id}'`)).toHaveLength(1);
});

test("manajer wajib verifikasi 2 langkah: tanpa MFA hanya Pengaturan → Keamanan yang terbuka", async ({ page }) => {
  sql("update settings set manager_mfa_required = true");
  try {
    await login(page, "manager");
    await page.goto("/manajer/jadwal");
    await expect(page).toHaveURL(/\/manajer\/pengaturan\?tab=keamanan/);
    await expect(page.getByRole("alert").filter({ hasText: "Wajib untuk manajer" })).toBeVisible();
  } finally {
    sql("update settings set manager_mfa_required = false");
  }
});
