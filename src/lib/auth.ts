import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import { homeFor, type Role } from "./roles";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Akun ber-verifikasi 2 langkah yang sesinya baru sandi (aal1)? aal dibaca dari klaim JWT yang sudah diverifikasi
 * getClaims(). Jangan pakai auth.mfa.getAuthenticatorAssuranceLevel() di server — ia membaca daftar faktor dari
 * cookie (bisa diubah pengguna → verifikasi 2 langkah terlewati).
 */
const mfaPending = (p: { mfa_enabled: boolean; active: boolean }, aal: unknown) => p.mfa_enabled && p.active && aal !== "aal2";

async function loadProfile(supabase: Supabase) {
  // JWT diverifikasi lokal (JWKS) — sama kuatnya dengan getUser() untuk identitas, tanpa panggilan ke server Auth.
  const { data: jwt } = await supabase.auth.getClaims();
  const uid = jwt?.claims.sub;
  if (!uid) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", uid).single();
  return data ? { p: data, aal: jwt.claims.aal } : null;
}

/**
 * Profil pengguna yang login — dasar otorisasi server action (mis. reset sandi dengan admin API).
 * null bila verifikasi 2 langkah belum selesai: sama seperti RLS, sandi saja tidak cukup.
 */
export async function getProfile() {
  const r = await loadProfile(await createClient());
  return r && !mfaPending(r.p, r.aal) ? r.p : null;
}

/** Guard di layout area. Proxy hanya redirect optimistis; data tetap dijaga RLS. */
export async function requireRole(role: Role) {
  const r = await loadProfile(await createClient());
  if (!r) redirect(role === "customer" ? "/akun" : "/login");
  const { p } = r;
  if (!p.active) redirect("/login?status=pending");
  if (mfaPending(p, r.aal)) redirect("/login?mfa=1");
  if (p.role !== role) redirect(homeFor(p.role));
  return p;
}
