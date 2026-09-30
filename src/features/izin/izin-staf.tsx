"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, Field, useOnline, useToast } from "@/components/ui";
import { formatJam, formatTanggal, jktDate } from "@/lib/domain/format";
import { addDays } from "@/lib/domain/schedule";
import { OFF_STATUS, offLabel } from "@/lib/domain/staff";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master, TimeOffRow } from "../counter/types";

type Conflict = { id: string; start_at: string; customer_name: string; status: string };

/** Manajer: setujui/tolak izin, lihat booking terdampak, catat izin langsung. */
export function IzinStaf({ master }: { master: Master }) {
  const toast = useToast();
  const online = useOnline();
  const { data, refresh } = useRealtimeTable(["staff_time_off", "appointments"], async () => {
    const supabase = createClient();
    const { data: rows } = await supabase.from("staff_time_off").select("id, staff_id, start_at, end_at, all_day, reason, status, created_at")
      .gte("end_at", new Date(Date.now() - 30 * 864e5).toISOString()).order("start_at");
    const now = Date.now();
    const list = ((rows ?? []) as (TimeOffRow & { created_at: string })[]).map((o) => ({ ...o, upcoming: Date.parse(o.end_at) > now }));
    const live = list.filter((o) => (o.status === "approved" || o.status === "pending") && o.upcoming);
    const conflicts = Object.fromEntries(await Promise.all(live.map(async (o) =>
      [o.id, ((await supabase.rpc("time_off_conflicts", { p_id: o.id })).data ?? []) as Conflict[]] as const)));
    return { list, conflicts };
  });
  const name = (id: string) => master.staff.find((s) => s.id === id)?.name ?? "—";

  const [f, setF] = useState({ staff: master.staff.find((s) => s.active)?.id ?? "", date: addDays(jktDate(), 1), until: addDays(jktDate(), 1), allDay: true, from: "13:00", to: "17:00", reason: "" });
  async function decide(id: string, approve: boolean) {
    const { error } = await createClient().rpc("decide_time_off", { p_id: id, p_approve: approve });
    if (error) return toast(error.message, "error");
    toast(approve ? "Izin disetujui" : "Izin ditolak"); refresh();
  }
  async function record() {
    const start = f.allDay ? `${f.date}T00:00:00+07:00` : `${f.date}T${f.from}:00+07:00`;
    const end = f.allDay ? `${addDays(f.until < f.date ? f.date : f.until, 1)}T00:00:00+07:00` : `${f.date}T${f.to}:00+07:00`;
    const { error } = await createClient().rpc("create_time_off_admin", { p_staff_id: f.staff, p_start: start, p_end: end, p_all_day: f.allDay, p_reason: f.reason });
    if (error) return toast(error.message, "error");
    toast(`Izin ${name(f.staff)} dicatat`); setF({ ...f, reason: "" }); refresh();
  }

  const list = data?.list ?? [];
  const groups = [
    ["Menunggu persetujuan", list.filter((o) => o.status === "pending")],
    ["Disetujui (mendatang)", list.filter((o) => o.status === "approved" && o.upcoming)],
    ["Riwayat 30 hari", list.filter((o) => !(o.status === "pending" || (o.status === "approved" && o.upcoming)))],
  ] as const;

  return (
    <div className="grid gap-4 min-[1000px]:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Izin staf</h1>
        {!data ? <Empty>Memuat…</Empty> : groups.map(([title, rows]) => (
          <section key={title} className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
            <h2 className="text-base font-bold">{title} <span className="text-muted tabular">· {rows.length}</span></h2>
            {!rows.length && <span className="text-sm text-muted">Tidak ada.</span>}
            {rows.map((o) => {
              const [l, bg, fg] = OFF_STATUS[o.status];
              const cf = data.conflicts[o.id] ?? [];
              return (
                <div key={o.id} className="flex flex-col gap-2 border-t border-[#F0EDE6] pt-2.5">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <span className="flex min-w-0 flex-1 flex-col"><b className="text-sm">{name(o.staff_id)} · <span className="tabular">{offLabel(o)}</span></b>
                      <span className="text-xs text-muted">{o.reason || "—"}</span></span>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: bg, color: fg }}>{l}</span>
                    {o.status === "pending" && (
                      <>
                        <button disabled={!online} onClick={() => decide(o.id, false)} className="btn-ghost h-11 rounded-[10px] text-[#A12A2A]">Tolak</button>
                        <button disabled={!online} onClick={() => decide(o.id, true)} className="btn h-11 rounded-[10px] bg-[#1F7A45] text-white">Setujui</button>
                      </>
                    )}
                  </div>
                  {!!cf.length && (
                    <div role="alert" className="rounded-[10px] bg-[#FFF1C2] px-3 py-2 text-[13px] text-[#5A4300]">
                      <b>{cf.length} booking terdampak</b> — pindahkan ke kapster lain:
                      <ul className="mt-1 list-inside list-disc">
                        {cf.map((c) => <li key={c.id} className="tabular">{c.customer_name} · {formatTanggal(c.start_at)} {formatJam(c.start_at)}</li>)}
                      </ul>
                      <Link href={`${master.base}/jadwal`} className="mt-1 inline-block font-bold underline">Buka jadwal →</Link>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>

      <form onSubmit={(e) => { e.preventDefault(); record(); }} className="flex flex-col gap-3 self-start rounded-[14px] border border-line bg-card p-5">
        <h2 className="font-display text-xl font-bold">Catat izin staf</h2>
        <Field label="Staf" htmlFor="io-staff">
          <select id="io-staff" className="input" value={f.staff} onChange={(e) => setF({ ...f, staff: e.target.value })}>
            {master.staff.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </Field>
        <div role="radiogroup" aria-label="Jenis izin" className="grid grid-cols-2 gap-2">
          {[[true, "Sehari penuh"], [false, "Rentang jam"]].map(([v, l]) => (
            <button type="button" role="radio" key={String(v)} aria-checked={f.allDay === v} onClick={() => setF({ ...f, allDay: v as boolean })}
              className={`h-11 rounded-[10px] border-2 text-sm font-bold ${f.allDay === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l as string}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Tanggal" htmlFor="io-date"><input id="io-date" type="date" className="input" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} /></Field>
          {f.allDay
            ? <Field label="Sampai" htmlFor="io-until"><input id="io-until" type="date" className="input" min={f.date} value={f.until < f.date ? f.date : f.until} onChange={(e) => e.target.value && setF({ ...f, until: e.target.value })} /></Field>
            : <div className="grid grid-cols-2 gap-1.5">
                <Field label="Dari" htmlFor="io-from"><input id="io-from" type="time" step={900} className="input px-2" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
                <Field label="Sampai" htmlFor="io-to"><input id="io-to" type="time" step={900} className="input px-2" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
              </div>}
        </div>
        <Field label="Alasan" htmlFor="io-reason"><input id="io-reason" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <button disabled={!online || !f.staff} className="btn-ink h-12">Catat & setujui</button>
      </form>
    </div>
  );
}
