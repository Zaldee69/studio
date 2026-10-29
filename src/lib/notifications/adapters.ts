// Adapter pengirim. Masing-masing "null" (nonaktif) sampai kredensial diisi di environment.
export type EmailMsg = { subject: string; text: string; html: string };
export type Adapters = {
  email: ((to: string, m: EmailMsg) => Promise<void>) | null;
  whatsapp: ((to: string, text: string, opts?: { instant?: boolean; priority?: boolean }) => Promise<void>) | null;
  telegram?: ((text: string) => Promise<void>) | null;
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
 * `priority`: didahulukan dari antrean (blast promo), dipakai untuk pesan transaksional (OTP, konfirmasi, pengingat).
 */
export function sendWhatsAppAdapter(): ((to: string, text: string, opts?: { instant?: boolean; priority?: boolean }) => Promise<void>) | null {
  const token = process.env.WABLAS_TOKEN, secret = process.env.WABLAS_SECRET_KEY;
  if (!token || !secret) return null;
  const base = (process.env.WABLAS_URL || "https://wablas.com").replace(/\/$/, "");
  return async (to, message, opts) => {
    const body = new URLSearchParams({ phone: to, message, ...(opts?.instant ? { flag: "instant" } : {}), ...(opts?.priority ? { priority: "true" } : {}) });
    const r = await fetch(`${base}/api/send-message`, {
      method: "POST", headers: { Authorization: `${token}.${secret}`, "Content-Type": "application/x-www-form-urlencoded" }, body,
    });
    const text = await r.text();
    let json: { status?: boolean; message?: string } | null = null;
    try { json = JSON.parse(text); } catch { /* bukan JSON */ }
    if (!r.ok || json?.status !== true) throw new Error(`Wablas ${r.status}: ${(json?.message ?? text).slice(0, 200)}`);
  };
}

/**
 * Telegram (notifikasi kritis untuk owner/manajer): TELEGRAM_BOT_TOKEN dari @BotFather, TELEGRAM_CHAT_ID = id chat/grup
 * penerima (pisahkan koma untuk beberapa). Dikirim ke semua penerima; gagal di salah satu → dicoba ulang (antrean).
 */
export function sendTelegramAdapter(): Adapters["telegram"] {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chats = (process.env.TELEGRAM_CHAT_ID ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!token || !chats.length) return null;
  return async (text) => {
    for (const chat_id of chats) {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id, text, disable_web_page_preview: true }),
      });
      const json = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null;
      if (!r.ok || json?.ok !== true) throw new Error(`Telegram ${r.status}: ${(json?.description ?? "").slice(0, 200)}`);
    }
  };
}

/** Pesan sengaja tidak dikirim (bukan gagal) → antrean menandainya "skipped", tanpa coba ulang. */
export class SkipSend extends Error {}

/**
 * Dev/E2E memakai Supabase lokal tetapi kredensial Wablas/Telegram yang sama dengan prod: data uji tidak boleh sampai ke
 * pelanggan atau owner. WA hanya ke NOTIFY_TEST_WA (62…, pisahkan koma; kosong = tidak ada WA), email tidak dikirim,
 * Telegram diberi tanda supaya tidak tertukar dengan notifikasi prod.
 */
export function localOnly(a: Adapters, testWa = ""): Adapters {
  const allowed = new Set(testWa.split(",").map((s) => s.trim()).filter(Boolean));
  const wa = a.whatsapp, tg = a.telegram;
  return {
    email: a.email && (async () => { throw new SkipSend("Lokal: email tidak dikirim"); }),
    whatsapp: wa && (async (to, text, opts) => {
      if (!allowed.has(to)) throw new SkipSend(`Lokal: ${to} bukan NOTIFY_TEST_WA`);
      return wa(to, text, opts);
    }),
    telegram: tg && ((text) => tg(`🧪 LOKAL (bukan prod)\n${text}`)),
  };
}

const isLocalDb = (url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "") => /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);

export const liveAdapters = (): Adapters => {
  const a = { email: sendEmailAdapter(), whatsapp: sendWhatsAppAdapter(), telegram: sendTelegramAdapter() };
  return isLocalDb() ? localOnly(a, process.env.NOTIFY_TEST_WA) : a;
};
