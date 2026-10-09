import { BRAND } from "../brand";
// Adapter pengirim. Masing-masing "null" (nonaktif) sampai kredensial diisi di environment.
export type EmailMsg = { subject: string; text: string; html: string };
export type Adapters = {
  email: ((to: string, m: EmailMsg) => Promise<void>) | null;
  whatsapp: ((to: string, text: string) => Promise<void>) | null;
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
 * WhatsApp via penyedia pihak ketiga (WhatsApp Business API / penyedia lokal) dengan endpoint HTTP sederhana:
 * POST WHATSAPP_API_URL, header Authorization: Bearer WHATSAPP_API_TOKEN, body {"to":"62…","message":"…"}.
 * Penyedia dengan format berbeda: sesuaikan fungsi ini saja.
 */
export function sendWhatsAppAdapter(): Adapters["whatsapp"] {
  const url = process.env.WHATSAPP_API_URL, token = process.env.WHATSAPP_API_TOKEN;
  if (!url || !token) return null;
  return async (to, message) => ok(await fetch(url, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ to, message }),
  }));
}

/** Hook OTP WhatsApp (verifikasi nomor) — siap dipakai saat penyedia WA aktif. */
export async function sendWhatsAppOtp(to: string, code: string) {
  const wa = sendWhatsAppAdapter();
  if (!wa) throw new Error("WhatsApp belum dikonfigurasi");
  await wa(to, `Kode verifikasi ${BRAND}: ${code}. Berlaku 10 menit. Jangan bagikan kode ini.`);
}

export const liveAdapters = (): Adapters => ({ email: sendEmailAdapter(), whatsapp: sendWhatsAppAdapter() });
