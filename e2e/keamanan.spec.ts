import { expect, test, type Page } from "@playwright/test";
import { createTeamUser, login, mailLink, PW, totp, uniq } from "./helpers";

const AUTH = /^sb-.*-auth-token(\.\d+)?$/;
/** Ubah isi sesi di cookie (meniru pengguna yang memalsukan cookie-nya sendiri). */
async function editSessionCookie(page: Page, edit: (s: Record<string, any>) => void) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ctx = page.context();
  const parts = (await ctx.cookies()).filter((c) => AUTH.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  const session = JSON.parse(Buffer.from(parts.map((c) => c.value).join("").replace(/^base64-/, ""), "base64url").toString());
  edit(session);
  const value = "base64-" + Buffer.from(JSON.stringify(session)).toString("base64url");
  await ctx.clearCookies({ name: AUTH });
  const base = parts[0].name.replace(/\.\d+$/, "");
  const chunks = value.match(/.{1,3180}/g)!; // ukuran potongan @supabase/ssr
  await ctx.addCookies(chunks.map((v, i) => ({ ...parts[0], name: chunks.length > 1 ? `${base}.${i}` : base, value: v })));
}

async function signIn(page: Page, email: string) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled();
  await page.fill("#email", email);
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
}

test("1 · daftar tim → wajib konfirmasi email → akun menunggu aktivasi manajer", async ({ page }) => {
  const email = `tim-${uniq()}@contoh.test`;
  await page.goto("/login?daftar=1");
  await expect(page.getByRole("button", { name: "Daftar" })).toBeEnabled();
  await page.fill("#full_name", "Tim Baru");
  await page.fill("#email", email);
  await page.fill("#password", "pendek");
  await page.selectOption("#role", "cashier");
  await page.fill("#invite_code", "GB-2026");
  await page.click("button[type=submit]");
  await expect(page.locator("form [role=alert]")).toContainText("huruf dan angka");
  await page.fill("#password", "rahasia123");
  await page.click("button[type=submit]");
  await expect(page.locator("form [role=status]")).toContainText("tautan konfirmasi");

  await signIn(page, email); // belum konfirmasi → ditolak (pesan umum, tidak membocorkan email terdaftar)
  await expect(page.locator("form [role=alert]")).toContainText("Email atau kata sandi salah");
  await page.goto(await mailLink(email));
  await expect(page).toHaveURL(/\/login\?status=pending/);
  await expect(page.getByText("menunggu aktivasi manajer")).toBeVisible();
});

test("2 · manajer aktifkan verifikasi 2 langkah → login butuh kode; tanpa kode area manajer tertutup", async ({ page }) => {
  test.setTimeout(90_000);
  const email = `mfa-${uniq()}@contoh.test`;
  await createTeamUser(email, "manager");
  await signIn(page, email);
  await page.waitForURL(/\/manajer/);

  await page.goto("/manajer/pengaturan?tab=keamanan");
  await page.getByRole("button", { name: "Aktifkan verifikasi 2 langkah" }).click();
  await expect(page.getByRole("img", { name: "Kode QR verifikasi 2 langkah" })).toBeVisible();
  const secret = (await page.locator("code").innerText()).trim();
  await page.fill("#mfa-verify", totp(secret));
  await page.getByRole("button", { name: "Aktifkan", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Aktif$/ })).toBeVisible();

  await page.context().clearCookies();
  await signIn(page, email);
  await expect(page.getByRole("heading", { name: "Verifikasi 2 langkah" })).toBeVisible();
  await page.goto("/manajer"); // sesi sandi saja (aal1) → dikembalikan ke langkah kode
  await expect(page).toHaveURL(/\/login\?mfa=1/);
  // cookie dipalsukan: daftar faktor dihapus → server tetap menolak (dicek ke DB, bukan dari cookie)
  await editSessionCookie(page, (s) => { s.user.factors = []; });
  await page.goto("/manajer");
  await expect(page).toHaveURL(/\/login\?mfa=1/);
  await page.fill("#mfa_code", "000000");
  await page.click("button[type=submit]");
  await expect(page.locator("form [role=alert]")).toContainText("Kode salah");
  // kode baru di jendela 30 dtk berikutnya (kode yang sama tidak boleh dipakai ulang)
  await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 500);
  await page.fill("#mfa_code", totp(secret));
  await page.click("button[type=submit]");
  await page.waitForURL(/\/manajer$/);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
});

test("3 · token kedaluwarsa lalu buka /booking → sesi tetap hidup (tidak 'logout sendiri')", async ({ page }) => {
  test.setTimeout(60_000);
  await login(page, "cashier");
  // Tandai sesi di cookie sudah kedaluwarsa → request berikutnya wajib refresh token.
  await editSessionCookie(page, (s) => { s.expires_at = Math.floor(Date.now() / 1000) - 60; });

  await page.goto("/booking"); // halaman publik yang membaca sesi di server
  await page.waitForTimeout(12_000); // lewat refresh_token_reuse_interval (10 dtk)
  await page.goto("/kasir/jadwal");
  await expect(page).toHaveURL(/\/kasir\/jadwal/);
});
