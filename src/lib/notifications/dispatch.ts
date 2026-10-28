import type { Adapters } from "./adapters";
import { render, type GroupInfo, type Template } from "./templates";

export type Queued = { id: string; channel: "email" | "whatsapp" | "telegram"; to_address: string; template: Template | "promo" | "otp" | "alert" | "test" | "staff_report"; booking_group_id: string | null; attempts: number; body?: string | null };
export type Store = {
  claim(limit: number): Promise<Queued[]>;                          // ambil 'queued' yang jatuh tempo → 'sending'
  group(id: string): Promise<GroupInfo | null>;
  finish(id: string, patch: { status: "sent" | "failed" | "skipped" | "queued"; attempts: number; last_error?: string | null; send_after?: string }): Promise<void>;
};

export const MAX_ATTEMPTS = 3;
const CHANNEL_NAME = { email: "Email", whatsapp: "WhatsApp", telegram: "Telegram" } as const;

/** Proses antrean outbound_messages. Gagal → coba lagi (5, 10 menit), setelah 3× → failed. Kanal nonaktif → skipped. */
export async function processQueue(store: Store, adapters: Adapters, now = new Date()) {
  const out = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  for (const m of await store.claim(25)) {
    const send = m.channel === "email" ? adapters.email : m.channel === "telegram" ? adapters.telegram : adapters.whatsapp;
    // promo (CRM), otp (kode masuk), alert (Telegram owner), test (tes WA manajer) & staff_report (rapor capster): teks sudah jadi
    const raw = m.template === "promo" || m.template === "otp" || m.template === "alert" || m.template === "test" || m.template === "staff_report";
    const g = raw ? null : m.booking_group_id ? await store.group(m.booking_group_id) : null;
    if (!raw && !g) { await store.finish(m.id, { status: "skipped", attempts: m.attempts, last_error: "Booking tidak ditemukan" }); out.skipped++; continue; }
    if (!send) { await store.finish(m.id, { status: "skipped", attempts: m.attempts, last_error: `${CHANNEL_NAME[m.channel]} belum dikonfigurasi` }); out.skipped++; continue; }
    try {
      // transaksional (OTP, konfirmasi, pengingat) didahulukan dari antrean blast promo di perangkat Wablas
      if (m.channel === "telegram") await adapters.telegram!(m.body ?? "");
      else if (m.template === "otp") await adapters.whatsapp!(m.to_address, m.body ?? "", { instant: true, priority: true }); // kode: kirim segera
      else if (m.template === "test") await adapters.whatsapp!(m.to_address, m.body ?? "", { priority: true }); // tes = jalur konfirmasi booking
      else if (raw) await adapters.whatsapp!(m.to_address, m.body ?? ""); // promo: ikut jeda perangkat
      else if (m.channel === "email") await adapters.email!(m.to_address, render(m.template as Template, g!, "email"));
      else await adapters.whatsapp!(m.to_address, render(m.template as Template, g!).text, { priority: true });
      await store.finish(m.id, { status: "sent", attempts: m.attempts + 1, last_error: null });
      out.sent++;
    } catch (e) {
      const attempts = m.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      await store.finish(m.id, {
        status: final ? "failed" : "queued", attempts, last_error: (e as Error).message.slice(0, 300),
        send_after: new Date(now.getTime() + attempts * 5 * 60_000).toISOString(),
      });
      if (final) out.failed++; else out.retry++;
    }
  }
  return out;
}
