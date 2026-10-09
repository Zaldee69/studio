// Adapter pengirim. Masing-masing "null" (nonaktif) sampai kredensial diisi di environment.
export type EmailMsg = { subject: string; text: string; html: string };
export type Adapters = {
  email: ((to: string, m: EmailMsg) => Promise<void>) | null;
  whatsapp: ((to: string, text: string, opts?: { instant?: boolean }) => Promise<void>) | null;
};

async function ok(r: Response) {
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
}

/** Email via Resend (https://resend.com): RESEND_API_KEY + EMAIL_FROM ("D'Pras Studio <booking@domainanda.com>"). */
export function sendEmailAdapter(): Adapters["email"] {
  const key = process.env.RESEND_API_KEY, from = process.env.EMAIL_FROM;
  if (!key || !from) return null;
  return async (to, m) => ok(await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject: m.subject, text: m.text, html: m.html }),
  }));
}

/**
 * WhatsApp via Wablas (https://wablas.com/documentation/api): POST {WABLAS_URL}/api/send-message,
 * header `Authorization: {WABLAS_TOKEN}.{WABLAS_SECRET_KEY}`, form `phone` (62…) & `message`.
 * WABLAS_URL default https://wablas.com — isi domain server dari dashboard Wablas bila berbeda.
 * Gagal sering tetap HTTP 200 dengan {"status": false, "message": …} → dicek di body.
 * `instant`: OTP diproses segera (flag=instant), tidak ikut antrean jeda perangkat.
 */
export function sendWhatsAppAdapter(): ((to: string, text: string, opts?: { instant?: boolean }) => Promise<void>) | null {
  const token = process.env.WABLAS_TOKEN, secret = process.env.WABLAS_SECRET_KEY;
  if (!token || !secret) return null;
  const base = (process.env.WABLAS_URL || "https://wablas.com").replace(/\/$/, "");
  return async (to, message, opts) => {
    const body = new URLSearchParams({ phone: to, message, ...(opts?.instant ? { flag: "instant" } : {}) });
    const r = await fetch(`${base}/api/send-message`, {
      method: "POST", headers: { Authorization: `${token}.${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const text = await r.text();
    let json: { status?: boolean; message?: string } | null = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    if (!r.ok || json?.status !== true) throw new Error(`Wablas ${r.status}: ${(json?.message ?? text).slice(0, 200)}`);
  };
}

export const liveAdapters = (): Adapters => ({ email: sendEmailAdapter(), whatsapp: sendWhatsAppAdapter() });
