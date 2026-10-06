"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { beep } from "@/lib/beep";
import { formatJam, formatTanggal, jktDate } from "@/lib/domain/format";
import { dayRange } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "./ui";

type Row = { id: string; booking_group_id: string | null; status: string; source: string; created_at: string; cancel_reason: string | null;
  status_changed_at: string | null; change_request: string | null; change_requested_at: string | null };
const SEEN_KEY = "gb-online-seen";
const getSeen = () => { try { return localStorage.getItem(SEEN_KEY) ?? new Date(0).toISOString(); } catch { return new Date(0).toISOString(); } };
const RECENT_MS = 2 * 60 * 1000;

/**
 * Notifikasi konter (manajer & kasir) dari aplikasi kapster:
 * "Budi — siap bayar (Andi)" saat status jadi completed, dan permintaan ubah jadwal. Mengembalikan jumlah "siap bayar" hari ini.
 */
export function useCounterAlerts(base: string) {
  const toast = useToast();
  const path = usePathname();
  const [ready, setReady] = useState(0);
  const [onlineNew, setOnlineNew] = useState(0);
  const seen = useRef(new Set<string>());
  const onJadwal = path.endsWith("/jadwal");
  const onJadwalRef = useRef(onJadwal);

  // Badge "Online baru" di menu Jadwal hilang saat Jadwal dibuka.
  useEffect(() => {
    onJadwalRef.current = onJadwal;
    if (!onJadwal) return;
    try { localStorage.setItem(SEEN_KEY, new Date().toISOString()); } catch { /* opsional */ }
    const t = setTimeout(() => setOnlineNew(0), 0);
    return () => clearTimeout(t);
  }, [onJadwal]);

  useEffect(() => {
    let alive = true;
    const supabase = createClient();
    const count = async () => {
      const [a, b] = dayRange(jktDate());
      const [{ count }, { count: fresh }] = await Promise.all([
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "completed").gte("start_at", a).lt("start_at", b),
        supabase.from("appointments").select("id", { count: "exact", head: true }).eq("source", "online").neq("status", "cancelled").gt("created_at", getSeen()),
      ]);
      if (!alive) return;
      setReady(count ?? 0);
      setOnlineNew(onJadwalRef.current ? 0 : fresh ?? 0);
    };
    const describe = async (id: string) => {
      const { data } = await supabase.from("appointments").select("start_at, customer:customers(name), staff:staff(name)").eq("id", id).single();
      return data;
    };
    const first = setTimeout(count, 0);
    const label = (d: { start_at: string; customer: { name: string } | null }) =>
      `${d.customer?.name ?? "Tamu"} · ${formatTanggal(d.start_at)} ${formatJam(d.start_at)}`;
    const notifyOnline = async (id: string, group: string | null) => {
      const key = `new:${group ?? id}`; // satu toast per booking (grup), bukan per layanan
      if (seen.current.has(key)) return;
      seen.current.add(key);
      count();
      const d = await describe(id);
      if (!alive || !d) return;
      toast(`Booking online baru: ${label(d)}`, "info", { label: "Buka jadwal", href: `${base}/jadwal` });
      beep();
    };
    const notifyDone = async (id: string) => {
      if (seen.current.has(`done:${id}`)) return;
      seen.current.add(`done:${id}`);
      const d = await describe(id);
      if (alive && d) toast(`${d.customer?.name ?? "Walk-in"} — siap bayar${d.staff ? ` (${d.staff.name})` : ""}`, "info", { label: "Buka di kasir", href: `${base}/kasir?booking=${id}` });
    };
    // Event realtime bisa terlewat (booking masuk sebelum langganan aktif, koneksi tablet putus-sambung):
    // kejar ketinggalan saat (ulang) tersambung + cadangan tiap 30 dtk. Duplikat dicegah `seen`.
    const opened = new Date().toISOString();
    const catchUp = async () => {
      const [{ data: online }, { data: done }] = await Promise.all([
        supabase.from("appointments").select("id, booking_group_id").eq("source", "online").neq("status", "cancelled").gt("created_at", opened),
        supabase.from("appointments").select("id").eq("status", "completed").gt("status_changed_at", opened),
      ]);
      if (!alive) return;
      for (const r of online ?? []) void notifyOnline(r.id, r.booking_group_id);
      for (const r of done ?? []) void notifyDone(r.id);
    };
    const poll = setInterval(catchUp, 30_000);
    const channel = supabase.channel(`counter-alerts:${crypto.randomUUID()}`).on("postgres_changes",
      { event: "INSERT", schema: "public", table: "appointments" }, async (p) => {
        const r = p.new as Row;
        if (r.source === "online") await notifyOnline(r.id, r.booking_group_id);
      }).on("postgres_changes",
      { event: "UPDATE", schema: "public", table: "appointments" }, async (p) => {
        const r = p.new as Row;
        count();
        const fresh = (t: string | null) => !!t && Date.now() - Date.parse(t) < RECENT_MS;
        const cx = `cx:${r.booking_group_id ?? r.id}`;
        if (r.source === "online" && r.status === "cancelled" && fresh(r.status_changed_at) && !seen.current.has(cx)
            && (r.cancel_reason === "Dibatalkan pelanggan" || r.cancel_reason === "Dijadwal ulang oleh pelanggan")) {
          seen.current.add(cx);
          const d = await describe(r.id);
          if (alive && d) {
            toast(`${r.cancel_reason === "Dibatalkan pelanggan" ? "Dibatalkan pelanggan" : "Dijadwal ulang pelanggan"}: ${label(d)}`, "ok", { label: "Buka jadwal", href: `${base}/jadwal` });
            beep(660);
          }
        }
        if (r.status === "completed" && fresh(r.status_changed_at)) await notifyDone(r.id);
        const key = `req:${r.id}:${r.change_requested_at}`;
        if (r.change_request && fresh(r.change_requested_at) && !seen.current.has(key)) {
          seen.current.add(key);
          const d = await describe(r.id);
          if (alive && d) toast(`${d.staff?.name ?? "Kapster"} minta ubah jadwal: ${d.customer?.name ?? "Walk-in"} ${formatJam(d.start_at)} — “${r.change_request}”`, "ok", { label: "Buka jadwal", href: `${base}/jadwal` });
        }
      });
    supabase.realtime.setAuth().then(() => { if (alive) channel.subscribe((status) => { if (status === "SUBSCRIBED") void catchUp(); }); });
    return () => { alive = false; clearTimeout(first); clearInterval(poll); supabase.removeChannel(channel); };
  }, [base, toast]);

  return { ready, onlineNew };
}
