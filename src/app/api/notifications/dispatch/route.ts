import { liveAdapters } from "@/lib/notifications/adapters";
import { processQueue, type Queued } from "@/lib/notifications/dispatch";
import { createAdminClient } from "@/lib/supabase/server";

// Dipanggil DB (pg_net) saat ada pesan baru dan oleh pg_cron tiap 5 menit untuk retry.
export async function POST(req: Request) {
  if (!process.env.PUSH_SECRET || req.headers.get("x-push-secret") !== process.env.PUSH_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const result = await processQueue({
    async claim(limit) {
      const { data: due } = await db.from("outbound_messages").select("id").eq("status", "queued").lte("send_after", new Date().toISOString()).limit(limit);
      if (!due?.length) return [];
      // klaim atomik: hanya baris yang masih 'queued' (dispatcher paralel tidak mengirim dobel)
      const { data } = await db.from("outbound_messages").update({ status: "sending" }).in("id", due.map((d) => d.id)).eq("status", "queued")
        .select("id, channel, to_address, template, booking_group_id, attempts");
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
        shop: { name: s?.shop_name ?? "Groom & Bloom", address: s?.shop_address ?? "", whatsapp: s?.shop_whatsapp ?? "" },
      };
    },
    async finish(id, patch) {
      await db.from("outbound_messages").update({ ...patch, ...(patch.status === "sent" ? { sent_at: new Date().toISOString() } : {}) }).eq("id", id);
    },
  }, liveAdapters());
  return Response.json(result);
}
