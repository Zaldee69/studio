// Verifikasi Cloudflare Turnstile di server. Nonaktif (selalu lolos) bila TURNSTILE_SECRET_KEY belum diisi — kecuali di
// production saat widget aktif (site key ada) tetapi secret kosong: salah konfigurasi → tolak (audit SEC-7).
import { log } from "./log";

export const captchaEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(token: string | null | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (process.env.VERCEL_ENV === "production" && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
      log("error", "turnstile_secret_missing");
      return false;
    }
    return true;
  }
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    return !!((await r.json()) as { success?: boolean }).success;
  } catch {
    return false; // gagal terhubung = tolak (fail closed)
  }
}
