import webpush from "web-push";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { createAdminClient } from "@/lib/supabase/server";

// Dipanggil trigger DB (pg_net) saat booking kapster dibuat / dipindah / dibatalkan → kirim Web Push ke perangkatnya.
const TITLE = { new: "Booking baru", changed: "Booking diubah", cancelled: "Booking dibatalkan" } as const;

export async function POST(req: Request) {
  if (!process.env.PUSH_SECRET || req.headers.get("x-push-secret") !== process.env.PUSH_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.VAPID_PRIVATE_KEY || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return Response.json({ sent: 0, skipped: "vapid" });
  const { appointment_id, kind } = (await req.json()) as { appointment_id: string; kind: keyof typeof TITLE };
  if (!TITLE[kind]) return Response.json({ error: "kind" }, { status: 400 });

  const admin = createAdminClient();
  const { data: a } = await admin.from("appointments")
    .select("staff_id, start_at, customer:customers(name), resource:resources(name), appointment_services(service:services(name))")
    .eq("id", appointment_id).single();
  if (!a?.staff_id) return Response.json({ sent: 0 });
  const { data: subs } = await admin.from("push_subscriptions").select("id, endpoint, p256dh, auth, profile:profiles!inner(staff_id)")
    .eq("profile.staff_id", a.staff_id);

  webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? "mailto:admin@example.com", process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  // Tanpa no. WA / harga: cukup nama, waktu, layanan.
  const payload = JSON.stringify({
    title: TITLE[kind], tag: `appt-${appointment_id}`, url: "/kapster",
    body: `${a.customer?.name ?? "Walk-in"} · ${formatTanggal(a.start_at).split(",")[0]} ${formatJam(a.start_at)} · ${a.appointment_services.map((s) => s.service?.name).join(", ")} · ${a.resource?.name ?? ""}`,
  });
  let sent = 0;
  await Promise.all((subs ?? []).map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
      sent++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      if (code === 404 || code === 410) await admin.from("push_subscriptions").delete().eq("id", s.id); // langganan kedaluwarsa
    }
  }));
  return Response.json({ sent });
}
