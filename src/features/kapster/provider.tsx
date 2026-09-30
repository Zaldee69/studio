"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/ui";
import { formatJam, formatTanggal, jktDate } from "@/lib/domain/format";
import { addDays, dayRange } from "@/lib/domain/schedule";
import type { ApptStatus } from "@/lib/domain/status";
import { beep } from "@/lib/beep";
import { createClient } from "@/lib/supabase/client";

export type MyAppt = {
  id: string; start_at: string; end_at: string; duration_min: number; status: ApptStatus; source: string; notes: string;
  resource_id: string; resource_name: string; customer_id: string | null; customer_name: string | null; customer_notes: string | null;
  arrived_at: string | null; service_started_at: string | null; service_ended_at: string | null; status_changed_at: string | null;
  changed_by_me: boolean | null; change_request: string | null; change_requested_at: string | null; service_ids: string[];
};
export type TimeOff = { id: string; staff_id: string; start_at: string; end_at: string; all_day: boolean; reason: string; status: "pending" | "approved" | "rejected" | "cancelled"; created_at: string };
export type Me = { name: string; staffId: string; category: "barbershop" | "nail"; station: boolean };
export type SvcLite = { id: string; name: string; duration_min: number };

type Ctx = {
  me: Me; services: Map<string, SvcLite>; appts: MyAppt[] | null; offs: TimeOff[] | null;
  refresh: () => Promise<void>; patch: (id: string, p: Partial<MyAppt>) => void; muted: boolean; setMuted: (m: boolean) => void;
};
const KapsterCtx = createContext<Ctx | null>(null);
export const useKapster = () => useContext(KapsterCtx)!;

const label = (a: MyAppt) => `${a.customer_name ?? "Walk-in"} · ${formatTanggal(a.start_at).split(",")[0]} ${formatJam(a.start_at)}`;

/**
 * Data kapster: booking miliknya hari ini s.d. +7 hari (view staff_my_appointments) + izin, realtime.
 * Tiap refresh dibandingkan dengan versi sebelumnya → toast + bunyi untuk booking baru/diubah/dibatalkan/lunas.
 */
export function KapsterProvider({ me, services, children }: { me: Me; services: SvcLite[]; children: React.ReactNode }) {
  const toast = useToast();
  const [appts, setAppts] = useState<MyAppt[] | null>(null);
  const [offs, setOffs] = useState<TimeOff[] | null>(null);
  const [muted, setMutedState] = useState(() => { try { return localStorage.getItem("gb-kapster-mute") === "1"; } catch { return false; } });
  const prev = useRef<Map<string, MyAppt> | null>(null);
  const mutedRef = useRef(muted);
  const setMuted = (m: boolean) => { mutedRef.current = m; setMutedState(m); try { localStorage.setItem("gb-kapster-mute", m ? "1" : "0"); } catch { /* opsional */ } };

  const load = useCallback(async () => {
    const today = jktDate();
    const supabase = createClient();
    const [{ data: a }, { data: o }] = await Promise.all([
      supabase.from("staff_my_appointments").select("*").gte("start_at", dayRange(today)[0]).lt("start_at", dayRange(addDays(today, 6))[1]).order("start_at"),
      supabase.from("staff_time_off").select("id, staff_id, start_at, end_at, all_day, reason, status, created_at").order("start_at", { ascending: false }).limit(60),
    ]);
    const rows = (a ?? []) as MyAppt[];
    const old = prev.current;
    if (old) {
      const events: [string, "info" | "ok"][] = [];
      for (const r of rows) {
        const p = old.get(r.id);
        if (!p) { if (r.status !== "cancelled") events.push([`Booking baru · ${label(r)}`, "info"]); continue; }
        if (r.status === "cancelled" && p.status !== "cancelled") events.push([`Booking dibatalkan · ${label(r)}`, "ok"]);
        else if (p.start_at !== r.start_at || p.resource_id !== r.resource_id) events.push([`Booking diubah · ${label(r)} · ${r.resource_name}`, "info"]);
        else if (r.status === "paid" && p.status !== "paid") events.push([`Lunas · ${r.customer_name ?? "Walk-in"}`, "ok"]);
      }
      for (const [id, p] of old) if (!rows.some((r) => r.id === id) && p.status !== "cancelled") events.push([`Booking dipindahkan dari Anda · ${label(p)}`, "ok"]);
      events.forEach(([t, k]) => toast(t, k));
      if (events.some(([, k]) => k === "info") && !mutedRef.current) beep();
    }
    prev.current = new Map(rows.map((r) => [r.id, r]));
    setAppts(rows);
    setOffs((o ?? []) as TimeOff[]);
  }, [toast]);

  useEffect(() => {
    const supabase = createClient();
    let alive = true;
    const first = setTimeout(load, 0);
    const channel = supabase.channel(`kapster:${crypto.randomUUID()}`);
    for (const table of ["appointments", "appointment_services", "staff_time_off"]) {
      channel.on("postgres_changes", { event: "*", schema: "public", table }, () => { if (alive) load(); });
    }
    supabase.realtime.setAuth().then(() => { if (alive) channel.subscribe(); });
    // ponytail: RLS tidak mengirim event untuk booking yang dipindah ke kapster lain → refresh berkala sebagai jaring.
    const t = setInterval(() => alive && load(), 60_000);
    return () => { alive = false; clearTimeout(first); clearInterval(t); supabase.removeChannel(channel); };
  }, [load]);

  const patch = (id: string, p: Partial<MyAppt>) => {
    setAppts((a) => a?.map((x) => (x.id === id ? { ...x, ...p } : x)) ?? a);
    const cur = prev.current?.get(id);
    if (cur) prev.current!.set(id, { ...cur, ...p }); // perubahan sendiri tidak memicu notifikasi
  };

  return (
    <KapsterCtx.Provider value={{ me, services: new Map(services.map((s) => [s.id, s])), appts, offs, refresh: load, patch, muted, setMuted }}>
      {children}
    </KapsterCtx.Provider>
  );
}
