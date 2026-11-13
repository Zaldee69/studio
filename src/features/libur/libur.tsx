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
type Off = { id: string; staff_id: string | null; profile_id: string | null; name: string; group: Group; kind: "izin" | "libur"; start_at: string; end_at: string; swapped: boolean; mine: boolean; bookings: number };
type Swap = { id: string; status: keyof typeof OFF_STATUS; partner_ok: boolean | null; reason: string; name: string; partner: string | null;
  from_date: string; new_date: string; mine: boolean; to_me: boolean; bookings: number };
type Person = { staff_id: string | null; profile_id: string | null; name: string; group: Group; day_off: number | null; me: boolean };
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
    // Error ditampilkan, bukan "Memuat…" selamanya (mis. migrasi jadwal libur belum dijalankan di server)
    return error ? { error: error.message } : (data as unknown as Board);
  }, month);

  async function call(fn: Fn, args: Record<string, unknown>, ok: string) {
    const { error } = await createClient().rpc(fn, args as never);
    refresh(); // juga saat ditolak, agar pilihan kembali ke nilai tersimpan
    if (error) return toast(error.message, "error");
    toast(ok);
  }

  if (!data) return <Empty>Memuat…</Empty>;
  if ("error" in data) return <Empty>Jadwal libur belum bisa dibuka: {data.error}</Empty>;
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

      {(manager || swaps.length > 0) && (
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
      )}

      <TabelLibur month={month} today={today} people={data.people} offs={data.offs} manager={manager} />

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

const ORDER: Record<Group, number> = { barbershop: 0, cashier: 1, massage: 2, nail: 3 };
const SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const dayNum = (d: string) => +d.slice(8);
const weekLabel = (w: string) => {
  const end = addDays(w, 6), m = (d: string) => new Intl.DateTimeFormat("id-ID", { month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
  return m(w) === m(end) ? `${dayNum(w)}–${dayNum(end)} ${m(end)}` : `${dayNum(w)} ${m(w)} – ${dayNum(end)} ${m(end)}`;
};

/** Jadwal libur bentuk tabel per minggu (seperti jadwal shift): baris = orang, kolom = Senin–Minggu. */
function TabelLibur({ month, today, people, offs, manager }: { month: string; today: string; people: Person[]; offs: Off[]; manager: boolean }) {
  const [showPast, setShowPast] = useState(false);
  const last = addDays(shiftMonth(month, 1), -1);
  const all: string[] = [];
  for (let w = monday(month); w <= last; w = addDays(w, 7)) all.push(w);
  const past = all.filter((w) => addDays(w, 6) < today && last >= today); // hanya disembunyikan di bulan yang sedang berjalan
  const weeks = showPast ? all : all.filter((w) => !past.includes(w));
  const who = (x: { staff_id: string | null; profile_id: string | null }) => x.staff_id ?? x.profile_id;
  const cell = new Map<string, Off>();
  for (const o of offs) {
    for (let d = dayOf(o), end = jktDate(new Date(Date.parse(o.end_at) - 1)); d <= end; d = addDays(d, 1)) {
      if (!cell.has(`${who(o)}|${d}`) || o.kind === "libur") cell.set(`${who(o)}|${d}`, o);
    }
  }
  const sorted = [...people].sort((a, b) => ORDER[a.group] - ORDER[b.group] || a.name.localeCompare(b.name));
  // Orang tanpa libur tetap & tanpa libur/izin bulan ini tidak diberi baris — disebut sekali di bawah tabel
  const rows = sorted.filter((p) => p.me || p.day_off || offs.some((o) => who(o) === who(p)));
  const always = sorted.filter((p) => !rows.includes(p));

  return (
    <section className="flex flex-col gap-3">
      {past.length > 0 && (
        <button onClick={() => setShowPast(!showPast)} className="self-start text-sm font-semibold text-muted underline underline-offset-4">
          {showPast ? "Sembunyikan minggu yang sudah lewat" : `Tampilkan ${past.length} minggu yang sudah lewat`}
        </button>
      )}
      {weeks.map((w) => {
        const days = Array.from({ length: 7 }, (_, i) => addDays(w, i));
        return (
          <div key={w} className="overflow-x-auto rounded-[14px] border border-line bg-card">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <caption className="px-4 pb-1 pt-3 text-left text-sm font-bold">
                {weekLabel(w)}{w <= today && today <= addDays(w, 6) && <span className="ml-2 font-normal text-muted">minggu ini</span>}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 z-10 w-20 bg-card py-2 pl-4 pr-1 text-left text-xs font-semibold text-muted">Nama</th>
                  {days.map((d, i) => (
                    <th key={d} scope="col" className={`min-w-9 px-0.5 py-2 text-center font-normal ${d.slice(0, 7) !== month.slice(0, 7) ? "opacity-40" : ""}`}>
                      <span className="block text-[11px] text-muted">{SHORT[i]}</span>
                      <span className={`mx-auto mt-0.5 flex size-7 items-center justify-center rounded-full text-[13px] font-bold tabular ${d === today ? "bg-ink text-white" : ""}`}>{dayNum(d)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={who(p)} className={p.me ? "bg-[#F3F1EC]" : ""}>
                    <th scope="row" className={`sticky left-0 z-10 max-w-20 border-t border-[#EEEEEA] py-1.5 pl-4 pr-1 text-left font-normal ${p.me ? "bg-[#F3F1EC]" : "bg-card"}`}>
                      <span className="block truncate text-[13px] font-semibold">{p.me ? "Saya" : p.name}</span>
                      <span className="block truncate text-[11px] text-muted">{title(p.group)}</span>
                    </th>
                    {days.map((d) => {
                      const o = cell.get(`${who(p)}|${d}`);
                      const dim = d.slice(0, 7) !== month.slice(0, 7) ? "opacity-40" : d < today ? "opacity-60" : "";
                      const warn = manager && o && o.bookings > 0 && d >= today;
                      return (
                        <td key={d} className={`border-t border-[#EEEEEA] px-0.5 py-1.5 text-center ${d === today ? "bg-[#EEF1EA]" : ""} ${dim}`}>
                          {!o ? <span aria-label="Masuk" className="mx-auto block size-1.5 rounded-full bg-[#D9D9D3]" />
                            : (
                              <span title={warn ? `${o.bookings} booking perlu dipindah` : undefined}
                                className={`relative mx-auto flex h-8 max-w-12 items-center justify-center rounded-lg px-0.5 text-[10.5px] font-semibold ${
                                  o.kind === "izin" ? "bg-[#FBF3DE] text-[#5A4300]" : o.swapped ? "border-2 border-ink text-ink" : "bg-ink text-white"}`}>
                                {o.kind === "izin" ? "Izin" : o.swapped ? "Tukar" : "Libur"}
                                {warn && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-[#D23B3B] ring-2 ring-card" />}
                              </span>
                            )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-ink" />Libur</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border-2 border-ink" />Libur hasil tukar</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded bg-[#FBF3DE]" />Izin</span>
        <span className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-[#D9D9D3]" />Masuk</span>
        {manager && <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-[#D23B3B]" />Ada booking di hari libur</span>}
      </p>
      {always.length > 0 && <p className="px-1 text-xs text-muted">Belum punya jadwal libur: {always.map((p) => p.name).join(", ")}.</p>}
    </section>
  );
}
