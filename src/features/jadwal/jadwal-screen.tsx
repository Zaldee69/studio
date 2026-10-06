"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sheet, useToast } from "@/components/ui";
import { CAT_STYLE } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { addDays, conflictingIds, jktMinutes, minToTime, nextQuarter, timeToMin } from "@/lib/domain/schedule";
import { approvedOffFor, offLabel } from "@/lib/domain/staff";
import { nextStatus, STATUS, type ApptStatus } from "@/lib/domain/status";
import { createClient } from "@/lib/supabase/client";
import { useDayAppointments, useDayTimeOff, useDayTransactions } from "../counter/hooks";
import type { Customer, DayAppt, Master } from "../counter/types";
import { BookingDrawer } from "./booking-drawer";
import { BookingForm, type FormInit } from "./booking-form";

const coarseQuery = "(pointer: coarse)";
const useCoarse = () => useSyncExternalStore(
  (cb) => { const m = matchMedia(coarseQuery); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
  () => matchMedia(coarseQuery).matches, () => false);

const nowMinutes = () => jktMinutes(new Date());
function useNowMin() {
  const [now, setNow] = useState(nowMinutes);
  useEffect(() => { const t = setInterval(() => setNow(nowMinutes()), 60_000); return () => clearInterval(t); }, []);
  return now;
}

export function JadwalScreen({ master, initialCustomer }: { master: Master; initialCustomer: Customer | null }) {
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const today = jktDate();
  const [date, setDate] = useState(today);
  const [selId, setSelId] = useState<string | null>(null);
  const [form, setForm] = useState<FormInit | null>(() => {
    if (params.get("new") !== "1") return null;
    return { date: today, startMin: nextQuarter(nowMinutes(), timeToMin(master.shop.open), timeToMin(master.shop.close)),
      resourceId: master.resources[0]?.id ?? "", customer: initialCustomer };
  });
  const { data, setData, refresh } = useDayAppointments(date);
  const { data: txs } = useDayTransactions(date);
  const { data: offs } = useDayTimeOff(date);
  const offFor = (a: DayAppt) => approvedOffFor(offs ?? [], a.staff_id, a.start_at, a.end_at);
  const coarse = useCoarse();
  const nowMin = useNowMin();
  const scroller = useRef<HTMLDivElement>(null);

  const px = coarse ? 1.5 : 1;
  const open = timeToMin(master.shop.open), close = timeToMin(master.shop.close);
  const appts = (data ?? []).filter((a) => a.status !== "cancelled");
  const conflicts = conflictingIds(appts);
  const sel = (data ?? []).find((a) => a.id === selId) ?? null;
  const revenue = (txs ?? []).filter((t) => !t.voided_at).reduce((a, t) => a + t.total, 0);
  const counts = Object.fromEntries((["pending_review", "booked", "arrived", "in_service", "completed", "paid"] as const).map((s) => [s, appts.filter((a) => a.status === s).length]));

  // Gulir ke jam sekarang saat membuka hari ini.
  useEffect(() => {
    if (date === today && scroller.current) scroller.current.scrollTop = Math.max(0, (nowMin - open - 60) * px);
  }, [date, today, px]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(a: DayAppt, status: ApptStatus) {
    setData((d) => d?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? d); // optimistis
    const { error } = await createClient().rpc("set_appointment_status", { p_id: a.id, p_status: status });
    if (error) { toast(error.message, "error"); refresh(); } else toast(`${a.customer?.name ?? "Walk-in"} → ${STATUS[status].label}`);
  }
  async function noShow(a: DayAppt) {
    const { error } = await createClient().rpc("mark_no_show", { p_id: a.id });
    if (error) return toast(error.message, "error");
    toast(`${a.customer?.name ?? "Walk-in"} → Tidak datang`); setSelId(null); refresh();
  }
  async function cancel(a: DayAppt, reason: string) {
    const { error } = await createClient().rpc("cancel_booking_admin", { p_id: a.id, p_reason: reason });
    if (error) { toast(error.message, "error"); return false; }
    toast("Booking dibatalkan"); setSelId(null); refresh(); return true;
  }
  async function review(a: DayAppt, accept: boolean, reason = "") {
    const { data, error } = await createClient().rpc("review_online_booking", { p_group: a.booking_group_id!, p_accept: accept, p_reason: reason });
    if (error) { toast(error.message, "error"); return; }
    const r = data as { code: string; customer_name: string; whatsapp: string | null; start_at: string };
    toast(accept ? `Booking ${r.code} diterima` : `Booking ${r.code} ditolak`);
    refresh();
    if (r.whatsapp) {
      const first = (r.customer_name ?? "").split(" ")[0];
      const msg = accept
        ? `Halo ${first}, booking ${r.code} di ${master.shop.name} untuk ${formatTanggal(r.start_at)} ${formatJam(r.start_at)} sudah kami konfirmasi. Sampai jumpa!`
        : `Halo ${first}, mohon maaf booking ${r.code} untuk ${formatTanggal(r.start_at)} ${formatJam(r.start_at)} belum bisa kami terima${reason ? ` (${reason})` : ""}. Silakan pilih jam lain di situs kami atau balas pesan ini.`;
      window.open(`https://wa.me/${r.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    }
  }
  async function dismissRequest(a: DayAppt) {
    const { error } = await createClient().rpc("dismiss_change_request", { p_id: a.id });
    if (error) toast(error.message, "error"); else { toast("Permintaan ditandai selesai"); refresh(); }
  }
  const quick = (a: DayAppt) => { const n = nextStatus(a.status); if (n) setStatus(a, n); };

  const hours: number[] = [];
  for (let h = Math.ceil(open / 60) * 60; h < close; h += 60) hours.push(h);
  const slots: number[] = [];
  for (let t = open; t < close; t += 30) slots.push(t);
  const newBooking = () => setForm({ date, resourceId: master.resources[0]?.id ?? "",
    startMin: date === today ? nextQuarter(nowMin, open, close) : open });

  return (
    <div className="flex h-[calc(100dvh-80px)] flex-col gap-3 xl:h-[calc(100dvh-88px)]">
      <div className="flex min-h-12 flex-wrap items-center gap-2.5 xl:gap-4">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Jadwal</h1>
        <div className="flex items-center gap-1">
          <button onClick={() => setDate(addDays(date, -1))} aria-label="Hari sebelumnya" className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
          </button>
          <label className="relative flex h-11 min-w-[150px] items-center justify-center rounded-[10px] border border-line bg-card px-3.5 text-sm font-semibold xl:min-w-[220px]">
            <span aria-live="polite">{formatTanggal(`${date}T12:00:00+07:00`)}</span>
            <input type="date" aria-label="Pilih tanggal" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0" />
          </label>
          <button onClick={() => setDate(addDays(date, 1))} aria-label="Hari berikutnya" className="flex size-11 items-center justify-center rounded-[10px] border border-line bg-card">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
          </button>
          <button onClick={() => setDate(today)} aria-pressed={date === today} className="h-11 rounded-[10px] border border-line bg-card px-4 text-sm font-semibold">Hari ini</button>
        </div>
        <div className="flex-1" />
        <div className="hidden gap-4 text-[13px] text-muted tabular min-[1000px]:flex">
          <span><b className="text-ink">{appts.length}</b> booking</span>
          <span><b className="text-[#6E1616]">{counts.completed}</b> belum bayar</span>
          <span>Omzet <b className="text-ink">{formatRupiah(revenue)}</b></span>
        </div>
        <button onClick={newBooking} className="btn-ink h-11 px-[18px]">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Booking baru
        </button>
      </div>

      <div className="flex min-h-7 flex-wrap items-center gap-2">
        {(["pending_review", "booked", "arrived", "in_service", "completed", "paid"] as const).filter((s) => s !== "pending_review" || counts[s] > 0).map((s) => (
          <span key={s} className="flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold" style={{ background: STATUS[s].bg, color: STATUS[s].fg }}>
            <span className="size-2 rounded-full" style={{ background: STATUS[s].dot }} />{STATUS[s].label} <span className="opacity-75 tabular">{counts[s]}</span>
          </span>
        ))}
        <span className="ml-2 hidden text-xs text-muted xl:inline">
          {coarse ? "Ketuk" : "Klik"} slot kosong untuk booking cepat · {coarse ? "tahan" : "klik kanan"} kartu untuk maju satu status
        </span>
      </div>

      {!!offs?.length && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[#EEEBE4] px-3 py-2 text-[13px] text-[#4A463F]">
          <b>Izin / cuti:</b>
          {offs.map((o) => <span key={o.id} className="rounded-full bg-card px-2.5 py-1 font-semibold">{master.staff.find((s) => s.id === o.staff_id)?.name} · {o.all_day ? "sehari penuh" : `${formatJam(o.start_at)}–${formatJam(o.end_at)}`}</span>)}
        </div>
      )}

      {/* GRID */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div style={{ minWidth: 56 + master.resources.length * 120 }}>
            <div className="sticky top-0 z-[3] flex h-[52px] border-b border-line bg-card">
              <div className="sticky left-0 z-[1] w-14 shrink-0 bg-card" />
              {master.resources.map((r) => (
                <div key={r.id} className="flex min-w-[120px] flex-1 flex-col justify-center gap-0.5 border-l border-[#EFECE5] px-2.5 py-2">
                  <span className="truncate text-[13px] font-bold">{r.name}</span>
                  <span className="self-start rounded-md px-1.5 py-px text-[11px] font-semibold" style={{ background: CAT_STYLE[r.type].bg, color: CAT_STYLE[r.type].fg }}>
                    {r.is_pedicure ? "Pedicure" : CAT_STYLE[r.type].label}
                  </span>
                </div>
              ))}
            </div>
            <div className="relative flex" style={{ height: (close - open) * px }}>
              <div className="sticky left-0 z-[2] w-14 shrink-0 bg-card">
                {hours.map((h) => (
                  <div key={h} className="absolute right-0 w-14 pr-2 pt-1 text-right text-[11px] text-muted tabular" style={{ top: (h - open) * px }}>{minToTime(h)}</div>
                ))}
              </div>
              {master.resources.map((r) => (
                <div key={r.id} className="relative min-w-[120px] flex-1 border-l border-[#EFECE5]"
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${30 * px - 1}px, #F4F2ED ${30 * px - 1}px, #F4F2ED ${30 * px}px, transparent ${30 * px}px, transparent ${60 * px - 1}px, #E9E6DF ${60 * px - 1}px, #E9E6DF ${60 * px}px)`,
                    backgroundPositionY: ((Math.ceil(open / 60) * 60 - open) % 60) * px }}>
                  {slots.map((t) => (
                    <button key={t} aria-label={`Booking baru ${r.name} ${minToTime(t)}`}
                      onClick={() => setForm({ date, startMin: t, resourceId: r.id })}
                      className="absolute inset-x-0 hover:bg-accent/5 focus-visible:bg-accent/10" style={{ top: (t - open) * px, height: 30 * px }} />
                  ))}
                  {appts.filter((a) => a.resource_id === r.id).map((a) => (
                    <ApptCard key={a.id} a={a} master={master} top={(jktMinutes(a.start_at) - open) * px} h={Math.max(a.duration_min * px, 26)}
                      conflict={conflicts.has(a.id)} off={!!offFor(a)} selected={a.id === selId} onOpen={() => setSelId(a.id)} onQuick={() => quick(a)} />
                  ))}
                </div>
              ))}
              {date === today && nowMin >= open && nowMin <= close && (
                <div aria-hidden="true" className="pointer-events-none absolute left-[50px] right-0 z-[2] h-0.5 bg-[#D23B3B]" style={{ top: (nowMin - open) * px }}>
                  <span className="absolute -left-1 -top-1 size-2.5 rounded-full bg-[#D23B3B]" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <Sheet open={!!sel} onClose={() => setSelId(null)} label="Detail booking" variant="drawer">
        {sel && (
          <BookingDrawer appt={sel} master={master} conflict={conflicts.has(sel.id)} onClose={() => setSelId(null)}
            offLabel={offFor(sel) ? offLabel(offFor(sel)!) : null} onDismissRequest={() => dismissRequest(sel)}
            onReview={(ok, reason) => review(sel, ok, reason)}
            onEdit={() => { setForm({ date, startMin: jktMinutes(sel.start_at), resourceId: sel.resource_id, appt: sel }); setSelId(null); }}
            onStatus={(s) => setStatus(sel, s)} onCancel={(r) => cancel(sel, r)} onNoShow={() => noShow(sel)} />
        )}
      </Sheet>

      <Sheet open={!!form} onClose={() => setForm(null)} label={form?.appt ? "Ubah booking" : "Booking baru"}>
        {form && (
          <BookingForm master={master} init={form} today={today} onClose={() => setForm(null)}
            onSaved={(d) => { setForm(null); setDate(d); refresh(); if (params.get("new")) router.replace(`${master.base}/jadwal`); }} />
        )}
      </Sheet>
    </div>
  );
}

function ApptCard({ a, master, top, h, conflict, off, selected, onOpen, onQuick }: {
  a: DayAppt; master: Master; top: number; h: number; conflict: boolean; off: boolean; selected: boolean; onOpen: () => void; onQuick: () => void;
}) {
  const S = STATUS[a.status];
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const long = useRef(false);
  const staff = master.staff.find((s) => s.id === a.staff_id)?.name ?? "—";
  const svc = a.appointment_services.map((s) => master.services.find((x) => x.id === s.service_id)?.name).filter(Boolean).join(", ");
  return (
    <button
      aria-label={`${a.customer?.name ?? "Walk-in"}, ${formatJam(a.start_at)}–${formatJam(a.end_at)}, ${staff}, ${S.label}${conflict ? ", bentrok" : ""}${a.change_request ? ", minta ubah jadwal" : ""}${off ? ", kapster izin" : ""}`}
      onClick={() => { if (!long.current) onOpen(); long.current = false; }}
      onContextMenu={(e) => { e.preventDefault(); onQuick(); }}
      onPointerDown={(e) => { if (e.pointerType !== "mouse") press.current = setTimeout(() => { long.current = true; onQuick(); }, 550); }}
      onPointerUp={() => clearTimeout(press.current)} onPointerLeave={() => clearTimeout(press.current)}
      className={`absolute inset-x-1 z-[1] flex flex-col gap-px overflow-hidden rounded-lg border px-2 py-1 text-left ${a.status === "pending_review" ? "border-2 border-dashed" : ""}`}
      style={{ top, height: h, background: S.bg, color: S.fg, borderColor: S.bd, outline: selected ? `2px solid ${S.dot}` : undefined, outlineOffset: 1 }}>
      <span className="flex w-full items-center gap-1.5 text-xs font-bold">
        <span className="size-[7px] shrink-0 rounded-full" style={{ background: S.dot }} />
        <span className="flex-1 truncate">{a.customer?.name ?? "Walk-in"}</span>
        {a.source === "online" && <span className="rounded bg-ink px-1.5 text-[10px] font-bold text-white">Online</span>}
        {a.status === "pending_review" && <span className="rounded border border-ink px-1 text-[10px] font-bold">Menunggu</span>}
        {conflict && <span className="rounded bg-[#6E1616] px-1.5 text-[10px] font-bold text-white">Bentrok</span>}
        {a.change_request && <span className="rounded bg-[#B25E00] px-1.5 text-[10px] font-bold text-white">Minta ubah</span>}
        {off && <span className="rounded bg-[#4A463F] px-1.5 text-[10px] font-bold text-white">Izin</span>}
      </span>
      <span className="truncate text-[11px] tabular">{formatJam(a.start_at)}–{formatJam(a.end_at)} · {staff}</span>
      <span className="truncate text-[11px] opacity-85">{svc}</span>
    </button>
  );
}
