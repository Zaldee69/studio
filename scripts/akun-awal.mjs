// Akun awal produksi: 1 manajer + 1 kasir, sandi acak yang hanya ditampilkan sekali di terminal (tidak disimpan di repo).
// Pakai:  npm run akun:awal -- <email-manajer> <email-kasir>
// Lewat alur daftar tim yang sama (kode undangan + trigger profil), lalu peran/aktif diset dengan kunci rahasia.
// Email langsung dianggap terkonfirmasi. Email yang sudah terdaftar dilewati (aman dijalankan ulang).
import { randomInt } from "node:crypto";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: key } = process.env;
const [managerEmail, cashierEmail] = process.argv.slice(2);
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL & SUPABASE_SECRET_KEY wajib (lihat .env.local)");
if (!managerEmail || !cashierEmail) throw new Error("Pakai: npm run akun:awal -- <email-manajer> <email-kasir>");

// fetch langsung (tanpa supabase-js: butuh WebSocket bawaan Node 22+)
const api = async (path, init = {}) => {
  const r = await fetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...init.headers } });
  const body = await r.json().catch(() => null);
  return r.ok ? { data: body } : { error: new Error(body?.msg ?? body?.message ?? `HTTP ${r.status}`) };
};
const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"; // tanpa karakter mirip (0/O, 1/l/I)
const password = () => {
  for (;;) {
    const p = Array.from({ length: 4 }, () => Array.from({ length: 5 }, () => ABC[randomInt(ABC.length)]).join("")).join("-");
    if (/[a-z]/.test(p) && /[A-Z]/.test(p) && /\d/.test(p)) return p;
  }
};

const { data: [s] = [], error: se } = await api("/rest/v1/settings?select=invite_code");
if (se || !s) throw se ?? new Error("Baris settings tidak ada — sudah `supabase db push`?");
console.log(`Target: ${url}\n`);

for (const [email, role, name] of [[managerEmail, "manager", "Manajer"], [cashierEmail, "cashier", "Kasir"]]) {
  const pw = password();
  const { data, error } = await api("/auth/v1/admin/users", { method: "POST", body: JSON.stringify({
    email, password: pw, email_confirm: true,
    // trigger hanya menerima kasir/kapster dari pendaftaran tim → manajer dinaikkan setelahnya
    user_metadata: { signup: "team", invite_code: s.invite_code, role: "cashier", full_name: name },
  }) });
  if (error) { console.log(`- ${email}: dilewati (${error.message})`); continue; }
  const { error: pe } = await api(`/rest/v1/profiles?id=eq.${data.id}`, { method: "PATCH", body: JSON.stringify({ role, active: true }) });
  if (pe) throw pe;
  console.log(`- ${role.padEnd(8)} ${email}  sandi: ${pw}`);
}
console.log("\nSimpan sandi di password manager sekarang — tidak ditampilkan lagi. Manajer: aktifkan verifikasi 2 langkah\n(Pengaturan → Keamanan). Ganti sandi kapan saja dari halaman lupa sandi.");
