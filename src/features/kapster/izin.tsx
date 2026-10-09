"use client";

import { useState } from "react";
import { useOnline, useToast } from "@/components/ui";
import { jktDate } from "@/lib/domain/format";
import { OFF_STATUS, offLabel } from "@/lib/domain/staff";
import { addDays } from "@/lib/domain/schedule";
import { createClient } from "@/lib/supabase/client";
import { useKapster } from "./provider";

/** Ajukan izin/cuti (sehari penuh / rentang jam) & lihat status. */
export function IzinKapster() {
  const { offs, refresh } = useKapster();
  const toast = useToast();
  const online = useOnline();
  const [date, setDate] = useState(addDays(jktDate(), 1));
  const [until, setUntil] = useState(addDays(jktDate(), 1));
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("13:00");
  const [to, setTo] = useState("17:00");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit() {
    const start = allDay ? `${date}T00:00:00+07:00` : `${date}T${from}:00+07:00`;
    const end = allDay ? `${addDays(until < date ? date : until, 1)}T00:00:00+07:00` : `${date}T${to}:00+07:00`;
    setSaving(true);
    const { error } = await createClient().rpc("request_time_off", { p_start: start, p_end: end, p_all_day: allDay, p_reason: reason });
    setSaving(false);
    if (error) return toast(error.message, "error");
    toast("Pengajuan izin terkirim ke manajer"); setReason(""); refresh();
  }
  async function cancel(id: string) {
    const { error } = await createClient().rpc("cancel_time_off", { p_id: id });
    if (error) return toast(error.message, "error");
    toast("Pengajuan dibatalkan"); refresh();
  }

  return (
    <>
      <h1 className="font-display text-[26px] font-bold">Izin &amp; cuti</h1>
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-3.5 rounded-[18px] bg-card p-4">
        <div role="radiogroup" aria-label="Jenis izin" className="grid grid-cols-2 gap-2">
          {[[true, "Sehari penuh"], [false, "Rentang jam"]].map(([v, l]) => (
            <button type="button" role="radio" aria-checked={allDay === v} key={String(v)} onClick={() => setAllDay(v as boolean)}
              className={`h-12 rounded-xl border-2 text-[15px] font-bold ${allDay === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l as string}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <label className="flex flex-col gap-1.5 text-[13px] font-bold">Tanggal{allDay && " mulai"}
            <input type="date" className="input" min={jktDate()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} /></label>
          {allDay ? (
            <label className="flex flex-col gap-1.5 text-[13px] font-bold">Sampai tanggal
              <input type="date" className="input" min={date} value={until < date ? date : until} onChange={(e) => e.target.value && setUntil(e.target.value)} /></label>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Dari<input type="time" step={900} className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
              <label className="flex flex-col gap-1.5 text-[13px] font-bold">Sampai<input type="time" step={900} className="input" value={to} onChange={(e) => setTo(e.target.value)} /></label>
            </div>
          )}
        </div>
        <label className="flex flex-col gap-1.5 text-[13px] font-bold">Alasan
          <input className="input" required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. acara keluarga, sakit" /></label>
        <button disabled={saving || !online || !reason.trim()} className="h-[60px] rounded-[14px] bg-ink text-[17px] font-bold text-white disabled:opacity-50">
          {saving ? "Mengirim…" : "Ajukan izin"}
        </button>
        <span className="text-xs text-muted">Setelah disetujui manajer, Anda tidak ditawarkan di booking online pada waktu tersebut.</span>
      </form>

      <section className="flex flex-col rounded-[18px] bg-card px-4 py-2">
        <span className="py-2.5 text-xs font-bold uppercase tracking-[0.06em] text-muted">Pengajuan saya</span>
        {offs && !offs.length && <span className="pb-3 text-sm text-muted">Belum ada pengajuan.</span>}
        {offs?.map((o) => {
          const [l, bg, fg] = OFF_STATUS[o.status];
          return (
            <div key={o.id} className="flex min-h-[60px] flex-wrap items-center gap-3 border-t border-[#EEEEEA] py-2">
              <span className="flex min-w-0 flex-1 flex-col"><b className="text-sm tabular">{offLabel(o)}</b><span className="text-xs text-muted">{o.reason}</span></span>
              <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: bg, color: fg }}>{l}</span>
              {o.status === "pending" && <button onClick={() => cancel(o.id)} className="min-h-11 rounded-[10px] border border-line px-3 text-[13px] font-bold text-[#A12A2A]">Batalkan</button>}
            </div>
          );
        })}
      </section>
    </>
  );
}
