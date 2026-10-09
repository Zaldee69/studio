"use client";

import { useState } from "react";
import { CloseButton, Sheet, useOnline, useToast } from "@/components/ui";
import { formatJam, formatTanggal, jktDate } from "@/lib/domain/format";
import { addDays, dayRange } from "@/lib/domain/schedule";
import { STATUS } from "@/lib/domain/status";
import { createClient } from "@/lib/supabase/client";
import { useKapster, type MyAppt } from "./provider";

/** 7 hari ke depan, hanya baca. Perubahan lewat "Minta ubah jadwal" ke konter. */
export function JadwalKapster() {
  const { appts, offs, services, refresh } = useKapster();
  const toast = useToast();
  const online = useOnline();
  const [ask, setAsk] = useState<MyAppt | null>(null);
  const [msg, setMsg] = useState("");
  const today = jktDate();

  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i)).map((d) => {
    const [a, b] = dayRange(d);
    const items = (appts ?? []).filter((x) => x.start_at >= a && x.start_at < b && x.status !== "cancelled")
      .sort((x, y) => x.start_at.localeCompare(y.start_at));
    const off = (offs ?? []).filter((o) => o.status === "approved" && Date.parse(o.start_at) < Date.parse(b) && Date.parse(o.end_at) > Date.parse(a));
    return { d, items, off };
  });

  async function send() {
    const { error } = await createClient().rpc("request_schedule_change", { p_id: ask!.id, p_message: msg });
    if (error) return toast(error.message, "error");
    toast("Permintaan dikirim ke konter"); setAsk(null); setMsg(""); refresh();
  }

  return (
    <>
      <h1 className="font-display text-[26px] font-bold">Jadwal saya · 7 hari</h1>
      {appts === null ? <p className="text-muted">Memuat…</p> : days.map(({ d, items, off }) => (
        <section key={d} className="flex flex-col rounded-[18px] bg-card px-4 py-2">
          <div className="flex items-center justify-between py-2.5 tabular">
            <b className="text-[15px]">{d === today && "Hari ini · "}{formatTanggal(`${d}T12:00:00+07:00`)}</b>
            <span className="text-[13px] text-muted">{items.length ? `${items.length} booking` : off.length ? "" : "Kosong"}</span>
          </div>
          {off.map((o) => (
            <div key={o.id} className="mb-2 rounded-xl bg-[#EFEFEB] px-3 py-2.5 text-sm font-semibold text-[#4A4C46]">
              Izin / cuti {o.all_day ? "sehari penuh" : `${formatJam(o.start_at)}–${formatJam(o.end_at)}`}{o.reason && ` · ${o.reason}`}
            </div>
          ))}
          {items.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 border-t border-[#EEEEEA] py-2.5 tabular">
              <b className="w-[96px] shrink-0 text-sm">{formatJam(a.start_at)}–{formatJam(a.end_at)}</b>
              <span className="flex min-w-0 flex-1 flex-col">
                <b className="text-sm">{a.customer_name ?? "Walk-in"}</b>
                <span className="text-xs text-muted">{a.service_ids.map((id) => services.get(id)?.name).join(", ")} · {a.resource_name}</span>
                {a.change_request && <span className="text-xs font-semibold text-[#5A4300]">Menunggu konter: “{a.change_request}”</span>}
              </span>
              {a.source === "online" && <span className="rounded bg-ink px-1.5 text-[10px] font-bold text-white">Online</span>}
              {a.status !== "booked" && <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: STATUS[a.status].bg, color: STATUS[a.status].fg }}>{STATUS[a.status].label}</span>}
              {a.status === "booked" && (
                <button onClick={() => { setAsk(a); setMsg(""); }} className="min-h-11 rounded-[10px] border border-line px-3 text-[13px] font-bold">Minta ubah jadwal</button>
              )}
            </div>
          ))}
        </section>
      ))}

      <Sheet open={!!ask} onClose={() => setAsk(null)} label="Minta ubah jadwal" width={460}>
        {ask && (
          <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex flex-col gap-3 p-5">
            <div className="flex items-start gap-3">
              <div className="flex flex-1 flex-col"><h2 className="font-display text-xl font-bold">Minta ubah jadwal</h2>
                <span className="text-[13px] text-muted tabular">{ask.customer_name ?? "Walk-in"} · {formatTanggal(ask.start_at)} {formatJam(ask.start_at)}</span></div>
              <CloseButton onClick={() => setAsk(null)} />
            </div>
            <label htmlFor="ask-msg" className="text-[13px] font-bold">Pesan untuk kasir</label>
            <textarea id="ask-msg" rows={3} required autoFocus value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Mis. mohon geser ke jam 14:00"
              className="rounded-xl border border-[#DCDCD6] px-3 py-2.5 text-base outline-none focus:border-accent" />
            <button disabled={!msg.trim() || !online} className="h-[60px] rounded-[14px] bg-ink text-[17px] font-bold text-white disabled:opacity-50">Kirim ke konter</button>
          </form>
        )}
      </Sheet>
    </>
  );
}
