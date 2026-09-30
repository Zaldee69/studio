// Verifikasi Cloudflare Turnstile di server. Nonaktif (selalu lolos) bila TURNSTILE_SECRET_KEY belum diisi.
export const captchaEnabled = () => !!process.env.TURNSTILE_SECRET_KEY;

export async function verifyTurnstile(token: string | null | undefined, ip?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    return !!((await r.json()) as { success?: boolean }).success;
  } catch {
    return false; // gagal terhubung = tolak (fail closed)
  }
}
