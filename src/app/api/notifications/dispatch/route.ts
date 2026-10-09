import { liveAdapters } from "@/lib/notifications/adapters";
import { processQueue, type Queued } from "@/lib/notifications/dispatch";
import { log } from "@/lib/log";
import { createAdminClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";

// Dipanggil DB (pg_net) saat ada pesan baru dan oleh pg_cron tiap 5 menit untuk retry.
// Blast promosi bisa ratusan pesan → proses batch 25 berulang sampai antrean habis / mendekati batas waktu fungsi.
export const maxDuration = 60;
export async function POST(req: Request) {
  if (!process.env.PUSH_SECRET || req.headers.get("x-push-secret") !== process.env.PUSH_SECRET) {
    log("warn", "notify_dispatch_unauthorized");
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const started = Date.now();
  const result = { sent: 0, skipped: 0, failed: 0, retry: 0 };
  for (;;) {
    const r = await processQueue({
      async claim(limit) {
        // send_after diisi jam DB; +60 dtk agar selisih jam server app ↔ DB tidak membuat pesan baru terlewat
        // (jeda retry 5–10 menit tetap berlaku)
        const due_by = new Date(Date.now() + 60_000).toISOString();
        const { data: due } = await db.from("outbound_messages").select("id").eq("status", "queued").lte("send_after", due_by).limit(limit);
        if (!due?.length) return [];
        // klaim atomik: hanya baris yang masih 'queued' (dispatcher paralel tidak mengirim dobel)
        const { data } = await db.from("outbound_messages").update({ status: "sending" }).in("id", due.map((d) => d.id)).eq("status", "queued")
          .select("id, channel, to_address, template, booking_group_id, attempts, body");
        return (data ?? []) as Queued[];
      },
      async group(id) {
        const [{ data: g }, { data: s }] = await Promise.all([
          db.from("booking_groups").select("code, customer:customers(name), appointments(start_at, status, staff:staff(name), appointment_services(service:services(name)))").eq("id", id).single(),
          db.from("settings").select("shop_name, shop_address, shop_whatsapp").single(),
        ]);
        const appts = (g?.appointments ?? []).filter((a) => a.status !== "cancelled");
        if (!g || !appts.length) return null;
        return {
          code: g.code, customerName: g.customer?.name ?? "", startAt: appts.map((a) => a.start_at).sort()[0],
          services: appts.flatMap((a) => a.appointment_services.map((x) => x.service?.name ?? "")).filter(Boolean),
          staff: appts.map((a) => a.staff?.name ?? "").filter(Boolean),
          shop: { name: s?.shop_name ?? BRAND, address: s?.shop_address ?? "", whatsapp: s?.shop_whatsapp ?? "" },
        };
      },
      async finish(id, patch) {
        await db.from("outbound_messages").update({ ...patch, ...(patch.status === "sent" ? { sent_at: new Date().toISOString() } : {}) }).eq("id", id);
      },
    }, liveAdapters());
    for (const k of Object.keys(result) as (keyof typeof result)[]) result[k] += r[k];
    // batch penuh (25) = mungkin masih ada; berhenti sebelum batas 60 dtk (sisanya diambil cron berikutnya)
    if (r.sent + r.skipped + r.failed + r.retry < 25 || Date.now() - started > 45_000) break;
  }
  // Detail error per pesan tersimpan di outbound_messages.last_error (Pengaturan → Halaman publik).
  if (result.failed || result.retry) log("warn", "notify_dispatch_errors", result);
  else if (result.sent) log("info", "notify_dispatch", result);
  return Response.json(result);
}
