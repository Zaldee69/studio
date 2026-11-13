"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Empty, useOnline, useToast } from "@/components/ui";
import { STAFF_TITLE, type Cat } from "@/lib/domain/category";
import { jktDate } from "@/lib/domain/format";
import { addDays } from "@/lib/domain/schedule";
import { OFF_STATUS } from "@/lib/domain/staff";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

type Group = Cat | "cashier";
type Off = { id: string; name: string; group: Group; kind: "izin" | "libur"; start_at: string; end_at: string; swapped: boolean; mine: boolean; bookings: number };
type Swap = { id: string; status: keyof typeof OFF_STATUS; partner_ok: boolean | null; reason: string; name: string; partner: string | null;
  from_date: string; new_date: string; mine: boolean; to_me: boolean; bookings: number };
type Person = { staff_id: string | null; profile_id: string | null; name: string; group: Group; day_off: number | null };
type Board = { offs: Off[]; swaps: Swap[]; people: Person[] };
type Fn = "set_day_off" | "request_day_off_swap" | "respond_day_off_swap" | "cancel_day_off_swap" | "decide_day_off_swap";

const DAYS = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const title = (g: Group) => (g === "cashier" ? "Kasir" : STAFF_TITLE[g]);
/** ISO weekday 1–7 dari "YYYY-MM-DD". */
const dow = (d: string) => ((new Date(d + "T00:00:00Z").getUTCDay() + 6) % 7) + 1;
const monday = (d: string) => addDays(d, 1 - dow(d));
const fmt = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const dayOf = (o: { start_at: string }) => jktDate(new Date(o.start_at));
const monthName = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(m + "T00:00:00Z"));
const shiftMonth = (m: string, n: number) => { const d = new Date(m + "T00:00:00Z"); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

/** Jadwal libur: libur tetap (manajer), tukar libur, dan libur semua orang di bulan yang dipilih. */
export function JadwalLibur({ manager = false }: { manager?: boolean }) {
  const toast = useToast();
  const online = useOnline();
  const today = jktDate();
  const [month, setMonth] = useState(today.slice(0, 8) + "01");
  const from = monday(month), to = addDays(monday(shiftMonth(month, 1)), 6);
  const { data, refresh } = useRealtimeTable(["staff_time_off", "day_off_swaps"], async () => {
    const { data, error } = await createClient().rpc("day_off_board", { p_from: from, p_to: to });
    if (error) throw error;
    return data as unknown as Board;
  }, month);

  async function call(fn: Fn, args: Record<string, unknown>, ok: string) {
    const { error } = await createClient().rpc(fn, args as never);
    refresh(); // juga saat ditolak, agar pilihan kembali ke nilai tersimpan
    if (error) return toast(error.message, "error");
    toast(ok);
  }

  if (!data) return <Empty>Memuat…</Empty>;
  const offsByDay = new Map<string, Off[]>();
  for (const o of data.offs) {
    for (let d = dayOf(o), last = jktDate(new Date(Date.parse(o.end_at) - 1)); d <= last; d = addDays(d, 1)) {
      if (d.slice(0, 7) === month.slice(0, 7)) offsByDay.set(d, [...(offsByDay.get(d) ?? []), o]);
    }
  }
  const days = [...offsByDay.keys()].sort();
  const mine = data.offs.filter((o) => o.mine && o.kind === "libur" && dayOf(o) >= today);
  const swaps = data.swaps.filter((s) => s.status === "pending" || manager);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="basis-full font-display sm:basis-auto sm:flex-1 text-[26px] font-bold tracking-tight">Jadwal libur</h1>
        <Button variant="outline" className="h-11 px-3" aria-label="Bulan sebelumnya" onClick={() => setMonth(shiftMonth(month, -1))}>‹</Button>
        <span className="min-w-36 text-center text-sm font-bold capitalize">{monthName(month)}</span>
        <Button variant="outline" className="h-11 px-3" aria-label="Bulan berikutnya" onClick={() => setMonth(shiftMonth(month, 1))}>›</Button>
      </div>

      {manager && (
        <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">Libur tetap tiap minggu</h2>
          <p className="text-xs text-muted">Capster hanya Senin–Kamis dan tidak boleh sama dengan capster lain. Kasir Selasa atau Kamis.
            Mengubah hari membuat ulang libur mendatang yang belum pernah ditukar.</p>
          {data.people.map((p) => (
            <label key={p.staff_id ?? p.profile_id} className="flex min-h-12 items-center gap-3 border-t border-[#EEEEEA] pt-2 text-sm">
              <span className="flex min-w-0 flex-1 flex-col"><b>{p.name}</b><span className="text-xs text-muted">{title(p.group)}</span></span>
              <NativeSelect className="w-40" disabled={!online} value={p.day_off ?? ""} aria-label={`Libur tetap ${p.name}`}
                onChange={(e) => call("set_day_off", { p_staff_id: p.staff_id, p_profile_id: p.profile_id, p_day: e.target.value ? +e.target.value : null },
                  `Libur tetap ${p.name} disimpan`)}>
                <option value="">Belum diatur</option>
                {DAYS.map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
              </NativeSelect>
            </label>
          ))}
        </section>
      )}

      {!manager && <LiburSaya mine={mine} offs={data.offs} today={today} online={online} call={call} />}

      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
        <h2 className="text-base font-bold">Pengajuan tukar libur <span className="text-muted tabular">· {swaps.length}</span></h2>
        {!swaps.length && <span className="text-sm text-muted">Tidak ada.</span>}
        {swaps.map((s) => {
          const [l, bg, fg] = OFF_STATUS[s.status];
          const waitPartner = s.partner && s.partner_ok === null && s.status === "pending";
          return (
            <div key={s.id} className="flex flex-col gap-2 border-t border-[#EEEEEA] pt-2.5">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <b>{s.partner ? `${s.name} tukar dengan ${s.partner}` : `${s.name} pindah libur`}</b>
                  <span className="text-xs text-muted">{fmt(s.from_date)} → {fmt(s.new_date)}{s.reason && ` · ${s.reason}`}
                    {waitPartner && ` · menunggu ${s.partner}`}</span>
                </span>
                <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: bg, color: fg }}>{l}</span>
                {s.status === "pending" && manager && !waitPartner && <>
                  <Button disabled={!online} variant="outline" className="h-11 text-[#A12A2A]" onClick={() => call("decide_day_off_swap", { p_id: s.id, p_approve: false }, "Tukar libur ditolak")}>Tolak</Button>
                  <Button disabled={!online} className="h-11" onClick={() => call("decide_day_off_swap", { p_id: s.id, p_approve: true }, "Tukar libur disetujui")}>Setujui</Button>
                </>}
                {s.status === "pending" && s.to_me && s.partner_ok === null && <>
                  <Button disabled={!online} variant="outline" className="h-11 text-[#A12A2A]" onClick={() => call("respond_day_off_swap", { p_id: s.id, p_accept: false }, "Tukar libur ditolak")}>Tolak</Button>
                  <Button disabled={!online} className="h-11" onClick={() => call("respond_day_off_swap", { p_id: s.id, p_accept: true }, "Anda setuju, menunggu manajer")}>Setuju</Button>
                </>}
                {s.status === "pending" && s.mine && <Button disabled={!online} variant="outline" className="h-11" onClick={() => call("cancel_day_off_swap", { p_id: s.id }, "Pengajuan dibatalkan")}>Batalkan</Button>}
              </div>
              {manager && s.status === "pending" && s.bookings > 0 && (
                <p role="alert" className="rounded-[10px] bg-[#FBF3DE] px-3 py-2 text-[13px] text-[#5A4300]">
                  Ada {s.bookings} booking di hari libur barunya. Pindahkan dulu ke capster lain setelah disetujui.</p>
              )}
            </div>
          );
        })}
      </section>

      <section className="flex flex-col gap-1 rounded-[14px] border border-line bg-card p-4">
        <h2 className="pb-1 text-base font-bold">Siapa libur di <span className="capitalize">{monthName(month)}</span></h2>
        {!days.length && <span className="text-sm text-muted">Belum ada libur di bulan ini.</span>}
        {days.map((d) => (
          <div key={d} className={`flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[#EEEEEA] py-2 text-sm ${d < today ? "opacity-50" : ""}`}>
            <span className={`w-40 shrink-0 ${d === today ? "font-bold" : ""}`}>{fmt(d)}{d === today && " · hari ini"}</span>
            <span className="flex flex-1 flex-wrap gap-1.5">
              {offsByDay.get(d)!.map((o) => (
                <span key={o.id} className={`rounded-full px-2.5 py-0.5 text-[13px] ${o.mine ? "bg-ink text-white" : "bg-paper"}`}>
                  {o.name} · {o.kind === "izin" ? "izin" : o.swapped ? "libur (ditukar)" : "libur"}
                  {manager && o.bookings > 0 && d >= today && <b className="text-[#A12A2A]"> · {o.bookings} booking</b>}
                </span>
              ))}
            </span>
          </div>
        ))}
      </section>
    </div>
  );
}

/** Libur saya yang akan datang + form pindah hari / tukar dengan rekan. */
function LiburSaya({ mine, offs, today, online, call }: {
  mine: Off[]; offs: Off[]; today: string; online: boolean;
  call: (fn: Fn, args: Record<string, unknown>, ok: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"move" | "swap">("move");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const cur = mine.find((o) => o.id === open);
  const week = cur ? Array.from({ length: 7 }, (_, i) => addDays(monday(dayOf(cur)), i)).filter((d) => d >= today && d !== dayOf(cur)) : [];
  const partners = cur ? offs.filter((o) => !o.mine && o.kind === "libur" && o.group === cur.group && week.includes(dayOf(o))) : [];
  // Hari yang lolos aturan (cermin check_day_off; server tetap memeriksa, termasuk akhir pekan kasir 1×/bulan)
  const moveDays = cur ? week.filter((d) => cur.group === "barbershop" ? dow(d) <= 4 && !partners.some((p) => dayOf(p) === d)
    : cur.group === "cashier" ? [2, 4, 6, 7].includes(dow(d)) : true) : [];

  async function submit() {
    if (!cur || !target) return;
    await call("request_day_off_swap", { p_off_id: cur.id, p_new_date: mode === "move" ? target : null, p_partner_off_id: mode === "swap" ? target : null, p_reason: reason },
      "Pengajuan terkirim ke manajer");
    setOpen(null); setTarget(""); setReason("");
  }

  return (
    <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
      <h2 className="text-base font-bold">Libur saya</h2>
      {!mine.length && <span className="text-sm text-muted">Belum ada libur di bulan ini. Hari libur tetap diatur manajer.</span>}
      {mine.map((o) => (
        <div key={o.id} className="flex flex-col gap-2 border-t border-[#EEEEEA] pt-2">
          <div className="flex items-center gap-2 text-sm">
            <b className="flex-1">{fmt(dayOf(o))}{o.swapped && <span className="font-normal text-muted"> · hasil tukar</span>}</b>
            <Button variant="outline" className="h-11" onClick={() => { setOpen(open === o.id ? null : o.id); setTarget(""); }}>{open === o.id ? "Tutup" : "Tukar"}</Button>
          </div>
          {open === o.id && (
            <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex flex-col gap-2 rounded-[10px] bg-paper p-3">
              <div role="radiogroup" aria-label="Cara tukar" className="grid grid-cols-2 gap-2">
                {([["move", "Pindah hari"], ["swap", "Tukar dengan rekan"]] as const).map(([v, l]) => (
                  <button type="button" role="radio" key={v} aria-checked={mode === v} onClick={() => { setMode(v); setTarget(""); }}
                    className={`h-11 rounded-[10px] border-2 text-sm font-bold ${mode === v ? "border-ink bg-ink text-white" : "border-line bg-card"}`}>{l}</button>
                ))}
              </div>
              <NativeSelect required value={target} aria-label={mode === "move" ? "Hari baru" : "Libur rekan"} onChange={(e) => setTarget(e.target.value)}>
                <option value="">{mode === "move" ? (moveDays.length ? "Pilih hari baru (minggu yang sama)" : "Tidak ada hari kosong minggu ini") : partners.length ? "Pilih libur rekan" : "Tidak ada rekan libur minggu ini"}</option>
                {mode === "move"
                  ? moveDays.map((d) => <option key={d} value={d}>{fmt(d)}</option>)
                  : partners.map((p) => <option key={p.id} value={p.id}>{p.name} · {fmt(dayOf(p))}</option>)}
              </NativeSelect>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Alasan (boleh kosong)" aria-label="Alasan" />
              <Button disabled={!online || !target} className="h-11">Ajukan</Button>
              <span className="text-xs text-muted">{mode === "swap" ? "Rekan setuju dulu, lalu manajer." : "Berlaku setelah disetujui manajer."}</span>
            </form>
          )}
        </div>
      ))}
    </section>
  );
}
