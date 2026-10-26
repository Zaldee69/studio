"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Sheet, useToast } from "@/components/ui";
import { CAT_STYLE } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { addDays, conflictingIds, jktMinutes, minToTime, nextQuarter, occupiedEnd, timeToMin } from "@/lib/domain/schedule";
import { approvedOffFor, offLabel } from "@/lib/domain/staff";
import { nextStatus, STATUS, type ApptStatus } from "@/lib/domain/status";
import { createClient } from "@/lib/supabase/client";
import { useDayAppointments, useDayTimeOff, useDayTransactions } from "../counter/hooks";
import type { Customer, DayAppt, Master, TimeOffRow } from "../counter/types";
import { BookingDrawer } from "./booking-drawer";
import { BookingForm, type FormInit } from "./booking-form";
import { apptName } from "@/lib/domain/guest";
import { firstName } from "@/lib/domain/customer";
import Link from "next/link";
import { floorStaff, staffNow } from "./now";
import { WalkInForm } from "./walk-in";

// Pilihan tampilan (per kursi / per kapster) diingat per perangkat; server selalu "kursi" (tanpa beda hidrasi).
const VIEW_KEY = "jadwal-view";
const viewSubs = new Set<() => void>();
const subscribeView = (cb: () => void) => { viewSubs.add(cb); return () => { viewSubs.delete(cb); }; };
const readView = (): "kursi" | "kapster" => { try { return localStorage.getItem(VIEW_KEY) === "kapster" ? "kapster" : "kursi"; } catch { return "kursi"; } };
const pickView = (v: "kursi" | "kapster") => { try { localStorage.setItem(VIEW_KEY, v); } catch { /* opsional */ } viewSubs.forEach((f) => f()); };

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
  const [walkIn, setWalkIn] = useState<{ staff: string | null } | null>(null); // Walk-in sekarang (staf terpilih dari panel)
  const [form, setForm] = useState<FormInit | null>(() => {
    if (params.get("new") !== "1") return null;
    return { date: today, startMin: nextQuarter(nowMinutes(), timeToMin(master.shop.open), timeToMin(master.shop.close)),
      resourceId: master.resources[0]?.id ?? "", customer: initialCustomer };
  });
  const { data, setData, refresh } = useDayAppointments(date);
  const { data: txs } = useDayTransactions(date);
  const { data: offs } = useDayTimeOff(date);
  const offFor = (a: DayAppt) => approvedOffFor(offs ?? [], a.staff_id, a.start_at, a.end_at);
  const nowMin = useNowMin();
  const scroller = useRef<HTMLDivElement>(null);

  // 2 px/menit: booking 30 menit = 60 px → nama, jam·staf, layanan & tombol aksi muat tanpa terpotong
  const px = 2;
  const open = timeToMin(master.shop.open), close = timeToMin(master.shop.close);
  const appts = (data ?? []).filter((a) => a.status !== "cancelled");
  const conflicts = conflictingIds(appts);
  const sel = (data ?? []).find((a) => a.id === selId) ?? null;
  const view = useSyncExternalStore(subscribeView, readView, () => "kursi" as const);
  /** Staf di kursi/bed: yang sedang melayani di sini (hari ini) + pemilik kursi (home_resource_id). */
  const chairStaff = (resId: string) => [...new Set([
    ...(date === today ? appts.filter((a) => a.resource_id === resId && (a.status === "in_service" || a.status === "arrived")).map((a) => a.staff_id) : []),
    ...master.staff.filter((s) => s.active && s.home_resource_id === resId).map((s) => s.id),
  ])].map((id) => master.staff.find((s) => s.id === id)?.name).filter(Boolean).join(", ");
  /** Kolom grid: per kursi/bed (default) atau per kapster (kartu = booking staf itu di kursi mana pun). */
  const cols = view === "kapster"
    ? [...floorStaff(master).map((s) => {
        const home = master.resources.find((r) => r.id === s.home_resource_id) ?? master.resources.find((r) => r.type === s.category);
        return { id: s.id, title: s.name, label: CAT_STYLE[s.category].label, tone: CAT_STYLE[s.category], sub: home?.name ?? "—",
          resourceId: home?.id ?? "", staffId: s.id as string | undefined, has: (a: DayAppt) => a.staff_id === s.id };
      }),
      ...(appts.some((a) => !a.staff_id) ? [{ id: "-", title: "Tanpa kapster", label: "—", tone: { bg: "#EFEFEB", fg: "#4A4C46" }, sub: "",
        resourceId: master.resources[0]?.id ?? "", staffId: undefined, has: (a: DayAppt) => !a.staff_id }] : [])]
    : master.resources.map((r) => ({ id: r.id, title: r.name, label: r.is_pedicure ? "Pedicure" : CAT_STYLE[r.type].label, tone: CAT_STYLE[r.type],
        sub: chairStaff(r.id) || "—", resourceId: r.id, staffId: undefined as string | undefined, has: (a: DayAppt) => a.resource_id === r.id }));
  const revenue = (txs ?? []).filter((t) => !t.voided_at).reduce((a, t) => a + t.total, 0);

  // Rentang grid = jam buka, diperlebar bila ada booking di luar jam buka (walk-in larut / datang awal).
  const startOf = (a: DayAppt) => jktMinutes(a.start_at);
  const endOf = (a: DayAppt) => startOf(a) + (occupiedEnd(a) - Date.parse(a.start_at)) / 60_000;
  const gOpen = Math.min(open, ...appts.map((a) => Math.floor(startOf(a) / 60) * 60));
  const gClose = Math.max(close, ...appts.map((a) => Math.ceil(endOf(a) / 60) * 60));

  // Setelah data hari itu termuat (sekali per tanggal): hari ini → jam sekarang; hari lain → booking pertama.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || !scroller.current || scrolledFor.current === date) return;
    scrolledFor.current = date;
    const first = appts.length ? Math.min(...appts.map(startOf)) : open;
    scroller.current.scrollTop = Math.max(0, ((date === today ? nowMin : first) - gOpen - 60) * px);
  }, [data, date]); // eslint-disable-line react-hooks/exhaustive-deps

  async function setStatus(a: DayAppt, status: ApptStatus) {
    setData((d) => d?.map((x) => (x.id === a.id ? { ...x, status } : x)) ?? d); // optimistis
    const { error } = await createClient().rpc("set_appointment_status", { p_id: a.id, p_status: status });
    if (error) { toast(error.message, "error"); refresh(); } else toast(`${apptName(a)} → ${STATUS[status].label}`);
  }
  async function noShow(a: DayAppt) {
    const { error } = await createClient().rpc("mark_no_show", { p_id: a.id });
    if (error) return toast(error.message, "error");
    toast(`${apptName(a)} → Tidak datang`); setSelId(null); refresh();
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
    // diterima → konfirmasi otomatis dari antrean pesan (tanpa wa.me agar tidak dobel); ditolak → kabari dari WA kasir
    if (!accept && r.whatsapp) {
      const first = firstName(r.customer_name ?? "");
      const msg = `Halo Kak${first ? ` ${first}` : ""},\nmohon maaf, jadwal ${formatTanggal(r.start_at)} pukul ${formatJam(r.start_at)} ternyata belum bisa kami layani${reason ? ` karena ${reason}` : ""}.`
        + `\n\nKakak bisa memilih jam lain di ${location.host}/booking, atau balas pesan ini dan kami bantu carikan waktu yang pas.`;
      window.open(`https://wa.me/${r.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank", "noopener");
    }
  }
  async function dismissRequest(a: DayAppt) {
    const { error } = await createClient().rpc("dismiss_change_request", { p_id: a.id });
    if (error) toast(error.message, "error"); else { toast("Permintaan ditandai selesai"); refresh(); }
  }
  const quick = (a: DayAppt) => { const n = nextStatus(a.status); if (n) setStatus(a, n); };

  const hours: number[] = [];
  for (let h = Math.ceil(gOpen / 60) * 60; h < gClose; h += 60) hours.push(h);
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
          <span>Omzet <b className="text-ink">{formatRupiah(revenue)}</b></span>
        </div>
        <button onClick={newBooking} className={`${date === today ? "btn-ghost" : "btn-ink"} h-11 px-[18px]`}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          Booking baru
        </button>
        {date === today && <button onClick={() => setWalkIn({ staff: null })} className="btn-ink h-11 px-[18px]">Walk-in sekarang</button>}
      </div>

      {date === today && (
        <NowPanel master={master} appts={appts} offs={offs ?? []} onStatus={setStatus} onOpen={setSelId} onWalkIn={(s) => setWalkIn({ staff: s })} />
      )}

      {/* hari ini: izin sudah tampil di panel Sekarang */}
      {date !== today && !!offs?.length && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-[10px] bg-[#EFEFEB] px-3 py-2 text-[13px] text-[#4A4C46]">
          <b>Izin / cuti:</b>
          {[...new Map(offs.map((o) => [o.staff_id, o])).values()].map((o) => <span key={o.id} className="rounded-full bg-card px-2.5 py-1 font-semibold">{master.staff.find((s) => s.id === o.staff_id)?.name} · {o.all_day ? "sehari penuh" : `${formatJam(o.start_at)}–${formatJam(o.end_at)}`}</span>)}
        </div>
      )}

      <div role="radiogroup" aria-label="Tampilan jadwal" className="flex self-start rounded-[10px] bg-paper p-1">
        {([["kursi", "Per kursi"], ["kapster", "Per kapster"]] as const).map(([v, l]) => (
          <button key={v} role="radio" aria-checked={view === v} onClick={() => pickView(v)}
            className={`h-9 rounded-lg px-3.5 text-[13px] font-bold ${view === v ? "bg-card shadow-sm" : "text-muted"}`}>{l}</button>
        ))}
      </div>

      {/* GRID */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[14px] border border-line bg-card">
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto overscroll-contain">
          <div style={{ minWidth: 56 + cols.length * 190 }}>
            <div className="sticky top-0 z-[3] flex h-[52px] border-b border-line bg-card">
              <div className="sticky left-0 z-[1] w-14 shrink-0 bg-card" />
              {cols.map((c) => (
                <div key={c.id} className="flex min-w-[190px] flex-1 flex-col justify-center gap-0.5 border-l border-[#EDEDE9] px-2.5 py-2">
                  <span className="truncate text-[13px] font-bold">{c.title}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="shrink-0 rounded-md px-1.5 py-px text-[11px] font-semibold" style={{ background: c.tone.bg, color: c.tone.fg }}>{c.label}</span>
                    <span className="truncate text-xs text-muted">{c.sub}</span>
                  </span>
                </div>
              ))}
            </div>
            <div className="relative flex" style={{ height: (gClose - gOpen) * px }}>
              <div className="sticky left-0 z-[2] w-14 shrink-0 bg-card">
                {hours.map((h) => (
                  <div key={h} className="absolute right-0 w-14 pr-2 pt-1 text-right text-[11px] text-muted tabular" style={{ top: (h - gOpen) * px }}>{minToTime(h % 1440)}</div>
                ))}
              </div>
              {cols.map((c) => (
                <div key={c.id} className="relative min-w-[190px] flex-1 border-l border-[#EDEDE9]"
                  style={{ backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${30 * px - 1}px, #F4F2ED ${30 * px - 1}px, #F4F2ED ${30 * px}px, transparent ${30 * px}px, transparent ${60 * px - 1}px, #E9E6DF ${60 * px - 1}px, #E9E6DF ${60 * px}px)` }}>
                  {/* di luar jam buka: arsir abu-abu (tetap bisa melihat kartu walk-in larut) */}
                  {gOpen < open && <div aria-hidden="true" className="absolute inset-x-0 top-0 bg-[#F4F2ED]/70" style={{ height: (open - gOpen) * px }} />}
                  {gClose > close && <div aria-hidden="true" className="absolute inset-x-0 bg-[#F4F2ED]/70" style={{ top: (close - gOpen) * px, height: (gClose - close) * px }} />}
                  {slots.map((t) => (
                    <button key={t} aria-label={`Booking baru ${c.title} ${minToTime(t)}`}
                      onClick={() => setForm({ date, startMin: t, resourceId: c.resourceId, staffId: c.staffId })}
                      className="absolute inset-x-0 hover:bg-accent/5 focus-visible:bg-accent/10" style={{ top: (t - gOpen) * px, height: 30 * px }} />
                  ))}
                  {appts.filter(c.has).map((a) => (
                    <ApptCard key={a.id} a={a} master={master} top={(jktMinutes(a.start_at) - gOpen) * px} h={Math.max(((occupiedEnd(a) - Date.parse(a.start_at)) / 60_000) * px, 40)}
                      conflict={conflicts.has(a.id)} off={!!offFor(a)} selected={a.id === selId} onOpen={() => setSelId(a.id)} onQuick={() => quick(a)}
                      payHref={`${master.base}/kasir?booking=${a.id}`} who={view === "kapster" ? master.resources.find((r) => r.id === a.resource_id)?.name : undefined} />
                  ))}
                </div>
              ))}
              {date === today && nowMin >= gOpen && nowMin <= gClose && (
                <div aria-hidden="true" className="pointer-events-none absolute left-[50px] right-0 z-[2] h-0.5 bg-[#D23B3B]" style={{ top: (nowMin - gOpen) * px }}>
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

      <Sheet open={!!walkIn} onClose={() => setWalkIn(null)} label="Walk-in sekarang" width={640}>
        {walkIn && <WalkInForm master={master} appts={appts} offs={offs ?? []} initialStaff={walkIn.staff}
          onClose={() => setWalkIn(null)} onDone={() => { setWalkIn(null); refresh(); }} />}
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

/** Aksi berikutnya di kartu: Datang → Mulai → Selesai → Bayar (ke kasir). */
const NEXT_LABEL: Partial<Record<ApptStatus, string>> = { booked: "Datang", arrived: "Mulai", in_service: "Selesai" };

function ApptCard({ a, master, top, h, conflict, off, selected, onOpen, onQuick, payHref, who }: {
  a: DayAppt; master: Master; top: number; h: number; conflict: boolean; off: boolean; selected: boolean; onOpen: () => void; onQuick: () => void; payHref: string;
  who?: string; // tampilan per kapster: nama kursi menggantikan nama staf di kartu
}) {
  const S = STATUS[a.status];
  const press = useRef<ReturnType<typeof setTimeout>>(undefined);
  const long = useRef(false);
  const staff = master.staff.find((s) => s.id === a.staff_id)?.name ?? "—";
  const svc = a.appointment_services.map((s) => master.services.find((x) => x.id === s.service_id)?.name).filter(Boolean).join(", ");
  const action = NEXT_LABEL[a.status];
  const hasAction = !!action || a.status === "completed";
  // tombol aksi di kolom kanan (tengah vertikal); teks kartu berhenti sebelum tombol
  const pill = "absolute right-1.5 top-1/2 z-[2] flex h-7 -translate-y-1/2 items-center rounded-md px-2 text-[11px] font-bold shadow-sm";
  return (
    <div className="absolute inset-x-1 z-[1]" style={{ top, height: h }}>
    <button
      aria-label={`${apptName(a)}, ${formatJam(a.start_at)}–${formatJam(new Date(occupiedEnd(a)))}, ${staff}, ${S.label}${conflict ? ", bentrok" : ""}${a.change_request ? ", minta ubah jadwal" : ""}${off ? ", kapster izin" : ""}`}
      onClick={() => { if (!long.current) onOpen(); long.current = false; }}
      onContextMenu={(e) => { e.preventDefault(); onQuick(); }}
      onPointerDown={(e) => { if (e.pointerType !== "mouse") press.current = setTimeout(() => { long.current = true; onQuick(); }, 550); }}
      onPointerUp={() => clearTimeout(press.current)} onPointerLeave={() => clearTimeout(press.current)}
      className={`flex h-full w-full flex-col gap-px overflow-hidden rounded-lg border py-1 pl-2 text-left ${hasAction ? "pr-[76px]" : "pr-2"} ${a.status === "pending_review" ? "border-2 border-dashed" : ""}`}
      style={{ background: "#FFFFFF", color: "#1F2320", borderColor: "#E5E5E0", borderLeft: `3px solid ${S.dot}`,
        outline: selected ? `2px solid ${S.dot}` : undefined, outlineOffset: 1 }}>
      <span className="flex w-full items-center gap-1.5 text-xs font-bold">
        <span className="size-[7px] shrink-0 rounded-full" style={{ background: S.dot }} />
        <span className="flex-1 truncate">{apptName(a)}</span>
        {a.source === "online" && <span className="rounded bg-ink px-1.5 text-[10px] font-bold text-white">Online</span>}
        {a.status === "pending_review" && <span className="rounded border border-ink px-1 text-[10px] font-bold">Menunggu</span>}
        {conflict && <span className="rounded bg-[#6E1616] px-1.5 text-[10px] font-bold text-white">Bentrok</span>}
        {a.change_request && <span className="rounded bg-[#B25E00] px-1.5 text-[10px] font-bold text-white">Minta ubah</span>}
        {off && <span className="rounded bg-[#4A4C46] px-1.5 text-[10px] font-bold text-white">Izin</span>}
      </span>
      <span className="truncate text-[11px] tabular">{formatJam(a.start_at)}–{formatJam(new Date(occupiedEnd(a)))} · {who ?? staff}</span>
      <span className="truncate text-[11px] opacity-85">{svc}</span>
    </button>
    {action && <button onClick={onQuick} aria-label={`${action} ${apptName(a)}`} className={`${pill} bg-ink text-white`}>{action} ▸</button>}
    {a.status === "completed" && <Link href={payHref} aria-label={`Bayar ${apptName(a)}`} className={`${pill} bg-[#A12A2A] text-white`}>Bayar ▸</Link>}
    </div>
  );
}

/** Ringkasan hari ini per kapster: sedang melayani / kosong / izin, berikutnya, dan tagihan yang belum dibayar. */
function NowPanel({ master, appts, offs, onStatus, onOpen, onWalkIn }: {
  master: Master; appts: DayAppt[]; offs: TimeOffRow[]; onStatus: (a: DayAppt, s: ApptStatus) => void; onOpen: (id: string) => void; onWalkIn: (staffId: string) => void;
}) {
  const unpaid = appts.filter((a) => a.status === "completed");
  const staff = floorStaff(master);
  if (!staff.length) return null;
  return (
    <section aria-label="Sekarang" className="flex gap-2 overflow-x-auto pb-1">
      {staff.map((s) => {
        const n = staffNow(appts, offs, s.id);
        const cur = n.current;
        const chair = master.resources.find((r) => r.id === (cur?.resource_id ?? s.home_resource_id))?.name;
        return (
          <div key={s.id} className={`flex min-w-[190px] flex-col gap-1 rounded-xl border px-3 py-2 text-[13px] ${n.free ? "border-[#BFE0C8] bg-[#F2F9F4]" : "border-line bg-card"}`}>
            <span className="flex items-center gap-1.5"><b className="min-w-0 flex-1 truncate">{s.name}</b>
              <span className={`rounded-full px-2 text-[11px] font-bold ${n.off ? "bg-[#EFEFEB] text-muted" : n.free ? "bg-[#D9F2E1] text-[#144D2A]" : "bg-[#FFE2CC] text-[#6B3000]"}`}>
                {n.off ? "Izin" : n.free ? "Kosong" : !cur ? "Ada booking" : cur.status === "arrived" ? "Menunggu" : "Melayani"}</span></span>
            {chair && <span className="-mt-1 truncate text-xs font-semibold text-muted">{chair}</span>}
            {cur ? (
              <button onClick={() => onOpen(cur.id)} className="truncate text-left text-muted">{apptName(cur)} · s/d {formatJam(new Date(occupiedEnd(cur)))}</button>
            ) : <span className="text-muted">{n.off ? "Tidak bisa dipilih hari ini" : "Siap menerima pelanggan"}</span>}
            <span className="truncate text-xs text-muted">{n.next ? `Berikutnya ${formatJam(n.next.start_at)} · ${apptName(n.next)}` : "Tidak ada booking berikutnya"}</span>
            <div className="mt-1 flex gap-1.5">
              {cur?.status === "in_service" && <button onClick={() => onStatus(cur, "completed")} aria-label={`Selesai ${apptName(cur)}`} className="h-8 rounded-lg bg-ink px-3 text-xs font-bold text-white">Selesai</button>}
              {cur?.status === "arrived" && <button onClick={() => onStatus(cur, "in_service")} aria-label={`Mulai ${apptName(cur)}`} className="h-8 rounded-lg bg-ink px-3 text-xs font-bold text-white">Mulai</button>}
              {!n.off && !cur && <button onClick={() => onWalkIn(s.id)} aria-label={`Walk-in dengan ${s.name}`} className="h-8 rounded-lg border border-ink px-3 text-xs font-bold">+ Walk-in</button>}
            </div>
          </div>
        );
      })}
      {unpaid.length > 0 && (
        <div className="flex min-w-[190px] flex-col gap-1 rounded-xl border border-[#E8C3C4] bg-[#FFF7F7] px-3 py-2 text-[13px]">
          <b className="text-[#6E1616]">Belum bayar · {unpaid.length}</b>
          {unpaid.slice(0, 3).map((a) => (
            <Link key={a.id} href={`${master.base}/kasir?booking=${a.id}`} className="flex items-center gap-2 truncate">
              <span className="flex-1 truncate">{apptName(a)}</span><span className="rounded-md bg-[#A12A2A] px-2 text-[11px] font-bold leading-6 text-white">Bayar ▸</span>
            </Link>
          ))}
          {unpaid.length > 3 && <span className="text-xs text-muted">+{unpaid.length - 3} lainnya</span>}
        </div>
      )}
    </section>
  );
}
