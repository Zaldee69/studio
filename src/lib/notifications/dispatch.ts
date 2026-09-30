import type { Adapters } from "./adapters";
import { render, type GroupInfo, type Template } from "./templates";

export type Queued = { id: string; channel: "email" | "whatsapp"; to_address: string; template: Template; booking_group_id: string | null; attempts: number };
export type Store = {
  claim(limit: number): Promise<Queued[]>;                          // ambil 'queued' yang jatuh tempo → 'sending'
  group(id: string): Promise<GroupInfo | null>;
  finish(id: string, patch: { status: "sent" | "failed" | "skipped" | "queued"; attempts: number; last_error?: string | null; send_after?: string }): Promise<void>;
};

export const MAX_ATTEMPTS = 3;

/** Proses antrean outbound_messages. Gagal → coba lagi (5, 10 menit), setelah 3× → failed. Kanal nonaktif → skipped. */
export async function processQueue(store: Store, adapters: Adapters, now = new Date()) {
  const out = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  for (const m of await store.claim(25)) {
    const g = m.booking_group_id ? await store.group(m.booking_group_id) : null;
    const send = m.channel === "email" ? adapters.email : adapters.whatsapp;
    if (!g) { await store.finish(m.id, { status: "skipped", attempts: m.attempts, last_error: "Booking tidak ditemukan" }); out.skipped++; continue; }
    if (!send) { await store.finish(m.id, { status: "skipped", attempts: m.attempts, last_error: `${m.channel === "email" ? "Email" : "WhatsApp"} belum dikonfigurasi` }); out.skipped++; continue; }
    const msg = render(m.template, g);
    try {
      if (m.channel === "email") await adapters.email!(m.to_address, msg);
      else await adapters.whatsapp!(m.to_address, msg.text);
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
