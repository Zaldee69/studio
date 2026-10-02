"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Cust } from "@/components/customer-auth";
import { OpenNow } from "@/components/open-now";
import { BackButton, PublicHeader } from "@/components/public-header";
import { captchaOn, Turnstile } from "@/components/turnstile";
import { bundleDiscount } from "@/lib/domain/cart";
import { formatJam, formatRupiah, formatTanggal, jktDate, normalizeWhatsApp } from "@/lib/domain/format";
import { dayWindow, type DayHours } from "@/lib/domain/hours";
import { buildIcs } from "@/lib/domain/ics";
import { addDays } from "@/lib/domain/schedule";
import { track } from "@/lib/funnel";
import { bookOnline, type BookedAppt } from "./actions";

// supabase-js (~250 KB) & form masuk dimuat setelah halaman tampil — hanya dipakai di efek & langkah "Masuk".
const db = () => import("@/lib/supabase/client").then((m) => m.createClient());
const CustomerAuth = dynamic(() => import("@/components/customer-auth").then((m) => m.CustomerAuth));

export type { Cust };
type Cat = "barbershop" | "nail";
type Svc = { id: string; name: string; category: Cat; price: number; duration: number; description: string };
type Staff = { id: string; name: string; category: Cat; photo: string | null };
type Shop = { name: string; address: string; whatsapp: string; bundlePct: number; maxDays: number; cutoffHours: number; open: boolean; review: boolean };
type View = "layanan" | "staf" | "waktu" | "konfirmasi" | "selesai" | "masuk";
export type Init = { step?: string; services: string[]; pick: Record<string, string>; together: boolean; date?: string; time?: string; cat: Cat };
export type Reschedule = { groupId: string; code: string; serviceIds: string[]; pick: Record<string, string>; together: boolean; startAt: string } | null;
type Done = { code: string; status: string; first: string; wa: string; when: string; appts: BookedAppt[]; durs: Partial<Record<Cat, number>>; lines: { name: string; staff: string; price: string }[]; total: string; rescheduled: boolean };

// Alur & tata letak: desain Booking.dc.html. Tampilan: bahasa visual Landing (gelap, emas, serif).
const FLOW = ["layanan", "staf", "waktu", "konfirmasi"] as const;
const STEP_LABEL = ["Layanan", "Staf", "Waktu", "Konfirmasi"];
const PRIMARY: Record<(typeof FLOW)[number], [string, string]> = {
  layanan: ["Lanjut pilih staf", "Lanjut"], staf: ["Lanjut pilih waktu", "Lanjut"],
  waktu: ["Lanjut konfirmasi", "Lanjut"], konfirmasi: ["Konfirmasi booking", "Konfirmasi"],
};
const CAT: Record<Cat, { label: string; world: string; staffTitle: string; staffSub: string }> = {
  barbershop: { label: "Barbershop", world: "Groom", staffTitle: "Kapster barbershop", staffSub: "Barber" },
  nail: { label: "Nail & Spa", world: "Bloom", staffTitle: "Nail artist", staffSub: "Nail artist" },
};

const fmtUtc = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...o, timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));
const longDate = (d: string) => formatTanggal(d + "T12:00:00+07:00");
const first = (n: string) => n.trim().split(/\s+/)[0] ?? "";
const initial = (n: string) => n.trim().charAt(0).toUpperCase();
const isView = (v?: string): v is (typeof FLOW)[number] => FLOW.includes(v as (typeof FLOW)[number]);

const h2 = "font-serif text-[34px] font-normal leading-none min-[900px]:text-[42px]";
const opt = (on: boolean) => `border ${on ? "border-gold bg-lux-3" : "border-rule-2 hover:border-dust"}`;
const chip = (on: boolean) => `border ${on ? "border-gold bg-gold text-lux" : "border-rule-2 text-cream hover:border-dust"}`;
const errBox = "border border-[#7A2E26] bg-[#2A1512] px-3.5 py-3 text-sm text-[#F2B8B0]";
// Kode dari booking_unavailable_reason(). "Keras" = tanggal lain pun tidak akan membantu.
const HARD_REASONS = new Set(["closed", "services", "capacity", "staff"]);
const REASON_MSG: Record<string, string> = {
  closed: "Booking online sedang ditutup. Silakan hubungi kami via WhatsApp.",
  services: "Layanan yang dipilih sudah tidak tersedia untuk booking online. Silakan pilih ulang layanan.",
  capacity: "Layanan ini sedang tidak tersedia untuk reservasi online. Silakan pilih ulang layanan atau hubungi kami via WhatsApp.",
  staff: "Staf yang dipilih sudah tidak tersedia. Pilih staf lain atau \"Siapa saja\".",
  range: "Tanggal ini di luar jangka booking online.",
  day_closed: "Toko tutup pada tanggal ini. Silakan pilih tanggal lain.",
  staff_off: "Staf pilihan Anda sedang izin pada tanggal ini. Pilih tanggal lain atau \"Siapa saja\".",
  today: "Jam tersisa hari ini sudah penuh atau sudah lewat. Silakan pilih tanggal lain.",
};

export default function BookingFlow({ services, staff, shop, hours, closures, customer, init, reschedule, cats: openCats }: {
  services: Svc[]; staff: Staff[]; shop: Shop; hours: DayHours[]; closures: string[]; customer: Cust; init: Init; reschedule: Reschedule;
  cats: readonly Cat[]; // kategori yang punya kursi/meja & staf aktif — yang lain tidak ditawarkan
}) {
  const router = useRouter();
  const today = jktDate();
  const days = Array.from({ length: shop.maxDays + 1 }, (_, i) => addDays(today, i));
  const isOpenDay = (d: string) => !!dayWindow(d, hours, closures);
  const known = new Set(services.map((s) => s.id));

  // Tautan/tab lama bisa berisi id layanan/staf yang sudah dihapus, dinonaktifkan, atau tak lagi bisa dibooking online.
  // Buang yang tidak dikenal; jangan pernah lompat ke langkah waktu tanpa layanan (dulu: semua tanggal "penuh").
  const initIds = reschedule?.serviceIds ?? init.services;
  const validIds = initIds.filter((id) => known.has(id));
  const rawPick: Record<string, string> = reschedule?.pick ?? init.pick;
  const staffOk = (c: Cat) => (staff.some((s) => s.id === rawPick[c] && s.category === c) ? rawPick[c] : "");
  const stalePick = (["barbershop", "nail"] as const).some((c) => rawPick[c] && !staffOk(c));
  const rescheduleBlocked = !!reschedule && validIds.length < initIds.length;
  const [view, setView] = useState<View>(() => reschedule ? "waktu" : isView(init.step) && validIds.length ? init.step : "layanan");
  const [cat, setCat] = useState<Cat>(init.cat);
  const [sel, setSel] = useState<string[]>(validIds);
  const [pick, setPick] = useState<Record<Cat, string>>(() => ({ barbershop: staffOk("barbershop"), nail: staffOk("nail") }));
  const [notice] = useState(() => !reschedule && (validIds.length < initIds.length || stalePick)
    ? "Sebagian pilihan dari tautan sebelumnya sudah tidak tersedia, jadi kami kosongkan. Silakan periksa pilihan Anda." : "");
  const [together, setTogether] = useState(reschedule?.together ?? init.together);
  const [date, setDate] = useState(() => init.date && days.includes(init.date) && isOpenDay(init.date) ? init.date : days.find(isOpenDay) ?? today);
  const [time, setTime] = useState(init.time ?? "");
  const [guest, setGuest] = useState({ name: "", wa: "" });
  const [note, setNote] = useState("");
  const [consent, setConsent] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [cust, setCust] = useState<Cust>(customer);
  const [returnTo, setReturnTo] = useState<View>("layanan");
  const [done, setDone] = useState<Done | null>(null);
  const [toast, setToast] = useState("");
  const [sending, setSending] = useState(false);
  const [slotRes, setSlotRes] = useState<{ key: string; list: string[]; next: string | null; error?: string; reason?: string | null }>({ key: "", list: [], next: null });
  const [offRes, setOffRes] = useState<{ date: string; ids: string[] }>({ date: "", ids: [] });
  const [preview, setPreview] = useState<{ key: string; names: Partial<Record<Cat, string>> }>({ key: "", names: {} });
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reqId = useRef<string | null>(null);

  const flash = (m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  };
  const go = (v: View) => {
    if (view === "layanan" && v === "staf") track("service");
    setView(v); setErr(""); window.scrollTo({ top: 0 });
  };
  useEffect(() => { track("booking_open"); }, []);

  // ---------- state langkah di URL (bisa di-refresh / dibagikan) ----------
  useEffect(() => {
    if (view === "selesai" || view === "masuk") return;
    const q = new URLSearchParams();
    q.set("langkah", view);
    if (sel.length) q.set("layanan", sel.join(","));
    const staf = Object.entries(pick).filter(([, v]) => v).map(([k, v]) => `${k}:${v}`).join(",");
    if (staf) q.set("staf", staf);
    if (!together) q.set("mode", "berurutan");
    if (view === "waktu" || view === "konfirmasi") q.set("tgl", date);
    if (time) q.set("jam", time);
    if (cat === "nail") q.set("kategori", "nail");
    if (reschedule) q.set("ulang", reschedule.groupId);
    window.history.replaceState(null, "", `/booking?${q}`);
  }, [view, sel, pick, together, date, time, cat, reschedule]);

  // ---------- turunan ----------
  const svcById = new Map(services.map((s) => [s.id, s]));
  const chosen = sel.map((id) => svcById.get(id)).filter((s): s is Svc => !!s);
  const cats = (["barbershop", "nail"] as const).filter((c) => chosen.some((s) => s.category === c));
  const bothCats = cats.length === 2;
  const subtotal = chosen.reduce((a, s) => a + s.price, 0);
  const discount = bundleDiscount(chosen.map((s) => ({ serviceId: s.id, name: s.name, category: s.category, price: s.price })), shop.bundlePct);
  const total = subtotal - discount;
  const staffPick = Object.fromEntries(Object.entries(pick).filter(([, v]) => v));
  const previewKey = view === "konfirmasi" && time ? JSON.stringify([date, time, sel, staffPick, together]) : "";
  const staffName = (c: Cat) => staff.find((s) => s.id === pick[c])?.name ?? (preview.key === previewKey ? preview.names[c] : undefined) ?? "Siapa saja";
  const lines = chosen.map((s) => ({ name: s.name, dur: `${s.duration} mnt`, price: formatRupiah(s.price), staff: staffName(s.category) }));
  const when = time ? `${longDate(date)} · ${time}` : "";
  const stepIdx = FLOW.indexOf(view as (typeof FLOW)[number]);
  const inFlow = stepIdx >= 0;
  const offIds = offRes.date === date ? offRes.ids : [];

  // Staf yang izin sepanjang tanggal terpilih tidak ditampilkan.
  useEffect(() => {
    let alive = true;
    db().then((c) => c.rpc("public_staff_off", { p_date: date })).then(({ data }) => { if (alive) setOffRes({ date, ids: data ?? [] }); });
    return () => { alive = false; };
  }, [date]);

  // ---------- slot (RPC get_available_slots; dicek ulang server saat konfirmasi) ----------
  const slotKey = view === "waktu" && sel.length && !rescheduleBlocked ? JSON.stringify([date, sel, staffPick, together]) : "";
  useEffect(() => {
    if (!slotKey) return;
    let alive = true;
    const [d, ids, sp, tg] = JSON.parse(slotKey);
    db().then(async (supabase) => {
        const { data, error } = await supabase.rpc("get_available_slots", { p_date: d, p_service_ids: ids, p_staff_pick: sp, p_together: tg, p_exclude_group: reschedule?.groupId });
        let next: string | null = null, reason: string | null = null;
        if (!error && !data?.length) {
          // Kosong ≠ selalu penuh: minta alasannya (booking ditutup, layanan/staf tak tersedia, toko tutup, staf izin…).
          reason = (await supabase.rpc("booking_unavailable_reason", { p_date: d, p_service_ids: ids, p_staff_pick: sp })).data ?? null;
          if (!reason || !HARD_REASONS.has(reason)) {
            next = (await supabase.rpc("next_available_date", { p_from: addDays(d, 1), p_service_ids: ids, p_staff_pick: sp, p_together: tg })).data ?? null;
          }
        }
        if (alive) setSlotRes({ key: slotKey, list: data ?? [], next, reason, error: error ? "Gagal memuat jam tersedia. Periksa koneksi lalu coba lagi." : undefined });
      });
    return () => { alive = false; };
  }, [slotKey, reschedule]);
  const slotsLoading = !!slotKey && slotRes.key !== slotKey;
  const slots = slotsLoading ? [] : slotRes.list;
  const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
  const slotGroups = [
    { label: "Pagi", f: (m: number) => m < 720 },
    { label: "Siang", f: (m: number) => m >= 720 && m < 900 },
    { label: "Sore & malam", f: (m: number) => m >= 900 },
  ].map((g) => ({ label: g.label, slots: slots.filter((t) => g.f(toMin(t))) })).filter((g) => g.slots.length);

  // Pratinjau penugasan "Siapa saja" sebelum konfirmasi.
  useEffect(() => {
    if (!previewKey) return;
    let alive = true;
    const [d, t, ids, sp, tg] = JSON.parse(previewKey);
    db().then((c) => c.rpc("preview_booking", { p_date: d, p_time: t, p_service_ids: ids, p_staff_pick: sp, p_together: tg })).then(({ data }) => {
      if (alive) setPreview({ key: previewKey, names: Object.fromEntries(((data ?? []) as { category: Cat; staff_name: string }[]).map((g) => [g.category, g.staff_name])) });
    });
    return () => { alive = false; };
  }, [previewKey]);

  // ---------- aksi utama ----------
  const guestOk = guest.name.trim() !== "" && normalizeWhatsApp(guest.wa) !== null && consent && (!captchaOn() || !!captcha);
  const primaryOk = shop.open && (view === "layanan" ? sel.length > 0 : view === "staf" ? true : view === "waktu" ? !!time
    : view === "konfirmasi" ? (!!cust || guestOk) && !sending : false);
  const resetReq = () => { reqId.current = null; };

  async function confirm() {
    setSending(true);
    setErr("");
    reqId.current ??= crypto.randomUUID(); // klik ganda / kirim ulang → permintaan yang sama
    const r = await bookOnline({
      date, time, service_ids: sel, staff_pick: staffPick, together, notes: note.trim(), client_request_id: reqId.current,
      ...(cust ? {} : { name: guest.name.trim(), whatsapp: guest.wa, consent, captcha_token: captcha ?? undefined }),
      ...(reschedule ? { reschedule_group: reschedule.groupId } : {}),
    });
    setSending(false);
    if (!r.ok) {
      resetReq();
      if (r.code === "slot_taken") { setTime(""); go("waktu"); flash(r.message); } else setErr(r.message);
      return;
    }
    track("booked");
    const assigned = new Map(r.appointments.map((g) => [g.category, g.staff_name ?? ""]));
    const name = cust ? cust.name : guest.name.trim();
    setDone({
      code: r.code, status: r.status, first: first(name), wa: cust ? cust.wa ?? "" : normalizeWhatsApp(guest.wa) ?? guest.wa, when, appts: r.appointments,
      durs: Object.fromEntries(cats.map((c) => [c, chosen.filter((s) => s.category === c).reduce((a, s) => a + s.duration, 0)])),
      lines: chosen.map((s) => ({ name: s.name, price: formatRupiah(s.price), staff: assigned.get(s.category) || staffName(s.category) })),
      total: formatRupiah(total), rescheduled: !!reschedule,
    });
    resetReq();
    setSel([]); setPick({ barbershop: "", nail: "" }); setTime(""); setNote(""); setGuest({ name: "", wa: "" });
    go("selesai");
    window.history.replaceState(null, "", "/booking");
  }

  function primary() {
    if (!primaryOk) return;
    if (view === "layanan") go("staf");
    else if (view === "staf") go("waktu");
    else if (view === "waktu") { track("time"); go("konfirmasi"); }
    else if (view === "konfirmasi") confirm();
  }

  function back() {
    if (reschedule && view === "waktu") { router.push("/akun"); return; }
    if (view === "staf") go("layanan");
    else if (view === "waktu") go("staf");
    else if (view === "konfirmasi") go("waktu");
    else if (view === "masuk") go(returnTo);
    else go("layanan");
  }

  const restart = () => { setDone(null); go("layanan"); };
  const openLogin = () => { setReturnTo(view === "konfirmasi" ? "konfirmasi" : "layanan"); go("masuk"); };

  function downloadIcs(d: Done) {
    const starts = d.appts.map((a) => Date.parse(a.start_at));
    const ends = d.appts.map((a) => Date.parse(a.start_at) + (d.durs[a.category] || 30) * 60000);
    const ics = buildIcs({
      uid: `${d.code}@groombloom`, start: new Date(Math.min(...starts)).toISOString(), end: new Date(Math.max(...ends)).toISOString(),
      title: `${shop.name} · ${d.lines.map((l) => l.name).join(", ")}`, location: shop.address,
      description: `Kode booking ${d.code}. Bayar di toko (tunai, QRIS, atau saldo deposit).`,
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    a.download = `${d.code}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const summaryLines = (withDur: boolean) => lines.map((l) => (
    <div key={l.name} className="flex justify-between gap-3 text-sm tabular-nums">
      <span className="flex flex-col gap-0.5">
        <span className="font-serif text-lg font-medium leading-tight">{l.name}</span>
        <span className="text-xs uppercase tracking-[0.14em] text-stone">{withDur ? `${l.dur} · ` : ""}{l.staff}</span>
      </span>
      <span className="shrink-0 text-cream">{l.price}</span>
    </div>
  ));

  return (
    <div className="min-h-screen bg-lux font-jost text-cream">
      <PublicHeader
        left={view !== "layanan" && view !== "selesai" ? <BackButton onClick={back} /> : undefined}
        right={cust ? (
          <Link href="/akun" className="flex h-11 items-center gap-2.5 border border-rule-2 pl-1.5 pr-4 text-xs font-medium uppercase tracking-[0.18em] text-cream hover:border-gold">
            <span className="flex size-8 items-center justify-center rounded-full border border-gold font-serif text-base normal-case italic tracking-normal text-gold">{initial(cust.name)}</span>
            {first(cust.name)}
          </Link>
        ) : (
          <button onClick={openLogin} className="btn-line">Masuk</button>
        )}
      />

      <div className="mx-auto flex max-w-[1180px] items-start gap-10 px-[22px] pb-32 pt-8 min-[900px]:px-11 min-[900px]:pb-20 min-[900px]:pt-12">
        {/* KOLOM UTAMA */}
        <div className="flex min-w-0 flex-1 flex-col gap-8">
          {!shop.open && (
            <div role="alert" className="border border-gold/60 bg-lux-3 px-4 py-3.5 text-sm text-sand">
              Booking online sedang ditutup sementara.{shop.whatsapp && <> Hubungi kami lewat <a className="text-gold underline" href={`https://wa.me/${shop.whatsapp}`}>WhatsApp</a>.</>}
            </div>
          )}
          {reschedule && view !== "selesai" && (
            <div role="status" className="border-l border-gold bg-lux-3 px-4 py-3 text-sm text-sand">
              Jadwal ulang <b className="text-cream">{reschedule.code}</b> · saat ini {formatTanggal(reschedule.startAt)} {formatJam(reschedule.startAt)}.
              Pilih jam baru — booking lama otomatis dibatalkan setelah yang baru berhasil.
            </div>
          )}
          {inFlow && (
            <nav aria-label="Langkah booking" className="flex flex-wrap items-center gap-2">
              {STEP_LABEL.map((label, i) => {
                const cur = i === stepIdx, isDone = i < stepIdx;
                return (
                  <span key={label} aria-current={cur ? "step" : undefined}
                    className={`flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.22em] ${cur ? "text-gold" : isDone ? "text-sand" : "text-ash"}`}>
                    <span className={`flex size-7 items-center justify-center rounded-full font-serif text-sm italic tracking-normal ${cur ? "bg-gold text-lux" : isDone ? "border border-gold text-gold" : "border border-rule-2"}`}>{i + 1}</span>
                    <span className={cur ? "" : "hidden min-[900px]:inline"}>{label}</span>
                    {i < 3 && <span className="ml-1 h-px w-6 bg-rule-2" />}
                  </span>
                );
              })}
            </nav>
          )}

          {/* STEP 1: LAYANAN */}
          {notice && inFlow && <p role="status" className="border border-gold/50 bg-lux-3 px-3.5 py-3 text-sm text-sand">{notice}</p>}
          {view === "layanan" && (
            <>
              <section className="relative flex flex-col gap-5 overflow-hidden border border-rule bg-lux-2 p-6 min-[900px]:p-10">
                <span className="eyebrow flex items-center gap-3.5"><span className="h-px w-10 bg-gold" />Reservasi online</span>
                <h1 className="font-serif text-[44px] font-normal leading-[0.95] min-[900px]:text-[64px]">
                  Seni merawat diri, <i className="text-gold">berdua.</i>
                </h1>
                <span className="text-[15px] font-light text-sand">Barbershop &amp; Nail Spa dalam satu tempat{shop.address && ` · ${shop.address}`}</span>
                <div className="flex flex-wrap gap-2">
                  <span className="flex h-8 items-center gap-2 border border-rule-2 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-dust">
                    <OpenNow hours={hours} closures={closures} />
                  </span>
                  <span className="flex h-8 items-center border border-rule-2 px-3 text-[11px] font-medium uppercase tracking-[0.18em] text-dust">Bayar di tempat · Tunai / QRIS</span>
                </div>
                {openCats.length > 1 && <div className="border-l border-gold bg-lux-3 px-4 py-3 text-sm font-light leading-relaxed text-sand">
                  <span className="font-serif text-lg italic text-gold">Paket Groom &amp; Bloom</span> — hemat {shop.bundlePct}% bila memesan barbershop + nail sekaligus, cocok untuk pasangan.
                </div>}
              </section>

              <div className="flex flex-col gap-5">
                <h2 className={h2}>Pilih <i className="text-gold">ritual</i> Anda</h2>
                <div role="tablist" aria-label="Kategori" className="flex gap-2">
                  {openCats.map((c) => (
                    <button key={c} role="tab" aria-selected={cat === c} onClick={() => setCat(c)}
                      className={`h-11 px-5 text-xs font-medium uppercase tracking-[0.22em] ${chip(cat === c)}`}>
                      {CAT[c].world} · {CAT[c].label}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col border-t border-rule">
                  {services.filter((s) => s.category === cat).map((s) => {
                    const on = sel.includes(s.id);
                    return (
                      <button key={s.id} aria-pressed={on}
                        onClick={() => { setSel(on ? sel.filter((i) => i !== s.id) : [...sel, s.id]); setTime(""); resetReq(); }}
                        className={`flex min-h-[84px] items-center gap-4 border-b border-rule px-2 py-4 text-left transition ${on ? "bg-lux-3" : "hover:bg-lux-2"}`}>
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                          <span className="flex items-baseline gap-2.5 tabular-nums">
                            <span className="font-serif text-[22px] font-medium">{s.name}</span>
                            <span className="flex-1 -translate-y-[5px] border-b border-dotted border-[#4A443B]" />
                            <span className="text-base">{formatRupiah(s.price)}</span>
                          </span>
                          {s.description && <span className="text-[13px] font-light text-sand">{s.description}</span>}
                          <span className="text-xs uppercase tracking-[0.14em] text-stone">{s.duration} menit</span>
                        </span>
                        <span className={`flex size-9 shrink-0 items-center justify-center rounded-full border border-gold ${on ? "bg-gold text-lux" : "text-gold"}`}>
                          {on
                            ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
                            : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {/* STEP 2: STAF */}
          {view === "staf" && (
            <>
              <h2 className={h2}>Pilih <i className="text-gold">kapster</i> &amp; nail artist</h2>
              {bothCats && (
                <div className="flex flex-col gap-3">
                  <span className="lux-label">Layanan ini untuk…</span>
                  <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
                    {[
                      { v: true, title: "Berdua, bersamaan", desc: "Mis. pasangan — barbershop & nail dimulai di jam yang sama" },
                      { v: false, title: "Saya sendiri, berurutan", desc: "Layanan nail dimulai setelah barbershop selesai" },
                    ].map((m) => (
                      <button key={m.title} aria-pressed={together === m.v} onClick={() => { setTogether(m.v); setTime(""); resetReq(); }}
                        className={`flex min-h-[80px] flex-col gap-1 px-4 py-3.5 text-left ${opt(together === m.v)}`}>
                        <span className="font-serif text-xl font-medium">{m.title}</span>
                        <span className="text-[13px] font-light text-dust">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {cats.map((c) => (
                <div key={c} className="flex flex-col gap-3">
                  <span className="font-serif text-[26px] italic text-gold">{CAT[c].world} <span className="font-jost text-xs not-italic uppercase tracking-[0.22em] text-dust">· {CAT[c].staffTitle}</span></span>
                  <div className="grid grid-cols-2 gap-3 min-[520px]:grid-cols-3 min-[900px]:grid-cols-4">
                    {[{ id: "", name: "Siapa saja", sub: "Jam terbanyak", photo: null as string | null },
                      ...staff.filter((s) => s.category === c && !offIds.includes(s.id)).map((s) => ({ id: s.id, name: s.name, sub: CAT[c].staffSub, photo: s.photo }))].map((o) => {
                      const on = pick[c] === o.id;
                      return (
                        <button key={o.id || "any"} aria-pressed={on} onClick={() => { setPick({ ...pick, [c]: o.id }); setTime(""); resetReq(); }}
                          className={`flex min-h-[150px] flex-col items-center justify-center gap-2 px-2.5 pb-4 pt-5 ${opt(on)}`}>
                          <span className={`relative flex h-16 w-[52px] items-center justify-center overflow-hidden rounded-t-full border font-serif text-[28px] italic ${o.id ? "border-rule-2 bg-lux text-gold" : "border-gold bg-gold text-lux"}`}>
                            {o.photo ? <Image src={o.photo} alt="" fill sizes="52px" className="object-cover" /> : o.id ? initial(o.name) : "★"}
                          </span>
                          <span className="text-center font-serif text-lg font-medium">{o.name}</span>
                          <span className="text-center text-[10px] uppercase tracking-[0.22em] text-stone">{o.sub}</span>
                        </button>
                      );
                    })}
                  </div>
                  {pick[c] && offIds.includes(pick[c]) && (
                    <p role="status" className="text-[13px] text-sand">{staff.find((s) => s.id === pick[c])?.name} sedang izin di {longDate(date)} — pilih kapster lain atau &quot;Siapa saja&quot;.</p>
                  )}
                </div>
              ))}
            </>
          )}

          {/* STEP 3: WAKTU */}
          {view === "waktu" && (
            <>
              <div className="flex flex-col gap-2">
                <h2 className={h2}>Pilih <i className="text-gold">tanggal</i> &amp; jam</h2>
                <span className="lux-label tabular-nums">{fmtUtc(date, { month: "long", year: "numeric" })}</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {days.map((d, i) => {
                  const on = d === date, closed = !isOpenDay(d);
                  return (
                    <button key={d} aria-pressed={on} aria-label={`${longDate(d)}${closed ? " (tutup)" : ""}`} disabled={closed}
                      onClick={() => { setDate(d); setTime(""); resetReq(); }}
                      className={`flex h-[84px] w-[68px] shrink-0 flex-col items-center justify-center gap-0.5 tabular-nums disabled:cursor-not-allowed disabled:border-rule disabled:text-ash disabled:line-through ${chip(on)}`}>
                      <span className="text-[10px] font-medium uppercase tracking-[0.14em]">{i === 0 ? "Hari ini" : fmtUtc(d, { weekday: "short" })}</span>
                      <span className="font-serif text-[28px] font-medium leading-none">{+d.slice(8, 10)}</span>
                      <span className="text-[10px] uppercase tracking-[0.14em]">{closed ? "Tutup" : fmtUtc(d, { month: "short" })}</span>
                    </button>
                  );
                })}
              </div>
              <div aria-live="polite" className="flex flex-col gap-7">
                {rescheduleBlocked ? (
                    <p role="alert" className={errBox}>Booking ini berisi layanan yang tidak bisa dijadwal ulang online. Silakan hubungi kami via WhatsApp.</p>
                  ) : !sel.length ? (
                    <div className="flex flex-col items-center gap-3 border border-rule bg-lux-2 p-6 text-center text-sm font-light text-sand">
                      <span>Belum ada layanan dipilih.</span>
                      <button onClick={() => go("layanan")} className="btn-line">Pilih layanan</button>
                    </div>
                  ) : slotsLoading ? <p className="text-sm font-light text-dust">Memuat jam tersedia…</p>
                  : slotRes.error ? <p role="alert" className={errBox}>{slotRes.error}</p>
                  : !slotGroups.length ? (
                    <div className="flex flex-col items-center gap-3 border border-rule bg-lux-2 p-6 text-center text-sm font-light text-sand">
                      <span>{REASON_MSG[slotRes.reason ?? ""] ?? <>Maaf, jam di tanggal ini sudah penuh untuk pilihan Anda. Coba tanggal lain atau pilih &quot;Siapa saja&quot;.</>}</span>
                      {/* data layanan di halaman ini sudah usang (tab lama) → muat ulang dari awal */}
                      {(slotRes.reason === "services" || slotRes.reason === "capacity") && <button onClick={() => { window.history.replaceState(null, "", "/booking"); window.location.reload(); }} className="btn-line">Pilih ulang layanan</button>}
                      {slotRes.reason === "staff" && <button onClick={() => { setPick({ barbershop: "", nail: "" }); go("staf"); }} className="btn-line">Pilih staf lain</button>}
                      {slotRes.next && (
                        <button onClick={() => { setDate(slotRes.next!); setTime(""); }} className="btn-line">
                          Tanggal terdekat: {longDate(slotRes.next)}
                        </button>
                      )}
                    </div>
                  ) : slotGroups.map((g) => (
                    <div key={g.label} className="flex flex-col gap-3">
                      <span className="font-serif text-xl italic text-gold">{g.label}</span>
                      <div className="grid grid-cols-3 gap-2 min-[420px]:grid-cols-4 min-[900px]:grid-cols-6">
                        {g.slots.map((t) => (
                          <button key={t} aria-pressed={time === t} onClick={() => { setTime(t); resetReq(); }}
                            className={`h-12 text-[15px] font-medium tabular-nums tracking-[0.06em] ${chip(time === t)}`}>
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}

          {/* STEP 4: KONFIRMASI */}
          {view === "konfirmasi" && (
            <>
              <h2 className={h2}>Tinjau &amp; <i className="text-gold">konfirmasi</i></h2>
              <div className="flex flex-col gap-3 border border-rule-2 bg-lux-2 p-5 min-[900px]:hidden">
                <span className="font-serif text-xl tabular-nums text-gold">{when}</span>
                {summaryLines(false)}
                {discount > 0 && (
                  <div className="flex justify-between text-sm tabular-nums text-gold">
                    <span>Estimasi diskon Groom &amp; Bloom {shop.bundlePct}%</span><span>−{formatRupiah(discount)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between border-t border-rule pt-3 tabular-nums">
                  <span className="lux-label">Estimasi total</span><span className="font-serif text-2xl">{formatRupiah(total)}</span>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <span className="lux-label">Data pemesan</span>
                {cust ? (
                  <div className="flex items-center gap-4 border border-rule-2 bg-lux-2 px-4 py-4">
                    <span className="flex size-11 items-center justify-center rounded-full border border-gold font-serif text-xl italic text-gold">{initial(cust.name)}</span>
                    <span className="flex flex-col"><span className="font-serif text-xl font-medium">{cust.name}</span>{cust.wa && <span className="text-[13px] tabular-nums text-stone">{cust.wa}</span>}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-3 border border-rule-2 px-4 py-4">
                      <span className="flex-[1_1_200px] text-sm font-light text-sand">Punya akun? Masuk untuk melihat riwayat &amp; saldo deposit.</span>
                      <button onClick={openLogin} className="btn-line">Masuk / Daftar</button>
                    </div>
                    <span className="text-[13px] font-light italic text-stone">Atau lanjut sebagai tamu</span>
                    <div className="grid grid-cols-1 gap-3 min-[520px]:grid-cols-2">
                      <div className="flex flex-col gap-2">
                        <label htmlFor="g-name" className="lux-label">Nama</label>
                        <input id="g-name" autoComplete="name" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} className="lux-input" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <label htmlFor="g-wa" className="lux-label">No. WhatsApp</label>
                        <input id="g-wa" inputMode="tel" autoComplete="tel" placeholder="08…" value={guest.wa} aria-describedby="g-wa-hint"
                          aria-invalid={!!guest.wa && !normalizeWhatsApp(guest.wa)}
                          onChange={(e) => setGuest({ ...guest, wa: e.target.value })} className="lux-input" />
                        {guest.wa && !normalizeWhatsApp(guest.wa) && <span id="g-wa-hint" className="text-xs text-[#F2B8B0]">Format nomor Indonesia, mis. 0812… atau +62812…</span>}
                      </div>
                    </div>
                    <label className="flex min-h-11 items-start gap-3 text-[13px] font-light leading-relaxed text-sand">
                      <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 size-5 shrink-0 accent-gold" />
                      <span>Saya menyetujui <Link href="/kebijakan-privasi" target="_blank" className="text-gold underline">kebijakan privasi</Link> — nama &amp; nomor WhatsApp dipakai untuk mengatur booking ini.</span>
                    </label>
                    <Turnstile onToken={setCaptcha} />
                  </>
                )}
                <div className="flex flex-col gap-2">
                  <label htmlFor="b-note" className="lux-label">Catatan untuk kami (opsional)</label>
                  <textarea id="b-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                    placeholder="Mis. model rambut yang diinginkan, warna kuku, alergi bahan…"
                    className="lux-input h-auto resize-y py-3 leading-normal" />
                </div>
                <div className="border-l border-gold bg-lux-2 px-4 py-3 text-[13px] font-light leading-relaxed text-sand">
                  <span className="text-cream">Bayar di toko:</span> tunai, QRIS, atau saldo deposit. Mohon datang 5 menit lebih awal.
                  Pembatalan &amp; jadwal ulang bisa dari menu akun sampai {shop.cutoffHours} jam sebelum mulai.
                  {shop.review && " Booking online dikonfirmasi toko terlebih dahulu."}
                </div>
                {err && <div role="alert" className={errBox}>{err}</div>}
              </div>
            </>
          )}

          {/* SELESAI */}
          {view === "selesai" && done && (
            <div className="flex flex-col items-start gap-5 pt-4">
              <div className="flex size-16 items-center justify-center rounded-full border border-gold text-gold">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
              </div>
              <span className="eyebrow">{done.status === "pending_review" ? "Menunggu konfirmasi toko" : done.rescheduled ? "Jadwal diubah" : "Booking terkonfirmasi"}</span>
              <h1 className="-mt-2 font-serif text-[44px] font-normal leading-none min-[900px]:text-[56px]">Sampai jumpa <i className="text-gold">di kursi kami.</i></h1>
              <span className="text-[15px] font-light leading-relaxed text-sand">
                Terima kasih, {done.first}! {done.status === "pending_review" ? "Booking Anda kami terima dan akan dikonfirmasi toko secepatnya." : "Jadwal Anda sudah masuk ke sistem kami."}
                {done.wa && <> Kabar selanjutnya lewat WhatsApp {done.wa}.</>}
              </span>
              <div className="flex w-full flex-col gap-3 border border-rule-2 bg-lux-2 p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-serif text-xl tabular-nums text-gold">{done.when}</span>
                  <span className="lux-label">Kode <b className="font-serif text-lg normal-case tracking-[0.08em] text-cream">{done.code}</b></span>
                </div>
                {done.lines.map((l) => (
                  <div key={l.name} className="flex justify-between gap-3 text-sm tabular-nums">
                    <span className="flex flex-col gap-0.5">
                      <span className="font-serif text-lg font-medium leading-tight">{l.name}</span>
                      <span className="text-xs uppercase tracking-[0.14em] text-stone">{l.staff}</span>
                    </span>
                    <span>{l.price}</span>
                  </div>
                ))}
                <div className="flex items-baseline justify-between border-t border-rule pt-3 tabular-nums">
                  <span className="lux-label">Estimasi total · bayar di toko</span><span className="font-serif text-2xl">{done.total}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button onClick={() => downloadIcs(done)} className="btn-line h-14 px-6">Tambahkan ke kalender</button>
                {shop.whatsapp && (
                  <a className="btn-line h-14 px-6" target="_blank" rel="noopener"
                    href={`https://wa.me/${shop.whatsapp}?text=${encodeURIComponent(`Halo ${shop.name}, saya ${done.first}. Booking ${done.code} · ${done.when}.`)}`}>
                    Chat toko via WhatsApp
                  </a>
                )}
              </div>
              <div className="flex flex-wrap gap-3">
                {cust && <Link href="/akun" className="btn-gold">Lihat booking saya</Link>}
                <button onClick={restart} className="btn-line h-14 px-8">Booking lagi</button>
              </div>
            </div>
          )}

          {/* MASUK / DAFTAR */}
          {view === "masuk" && (
            <CustomerAuth onDone={(c) => { setCust(c); go(returnTo); flash(`Halo, ${first(c.name)}!`); }} />
          )}
        </div>

        {/* RINGKASAN (layar lebar) */}
        {inFlow && (
          <aside aria-label="Ringkasan booking"
            className="sticky top-[100px] hidden w-[360px] shrink-0 flex-col gap-4 border border-rule-2 bg-lux-2 p-6 min-[900px]:flex">
            <div className="flex flex-col gap-1">
              <span className="eyebrow">Ringkasan</span>
              <span className="font-serif text-2xl">{shop.name}</span>
              {shop.address && <span className="text-[13px] font-light text-stone">{shop.address}</span>}
            </div>
            <div className="h-px bg-rule" />
            {!lines.length && <span className="py-2 text-sm font-light italic text-dust">Belum ada layanan dipilih.</span>}
            {time && stepIdx >= 2 && (
              <div className="flex items-center gap-2 font-serif text-lg tabular-nums text-gold">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></svg>
                {when}
              </div>
            )}
            <div className="flex flex-col gap-3">{summaryLines(true)}</div>
            {discount > 0 && (
              <div className="flex justify-between text-sm tabular-nums text-gold">
                <span>Estimasi diskon Groom &amp; Bloom {shop.bundlePct}%</span><span>−{formatRupiah(discount)}</span>
              </div>
            )}
            {lines.length > 0 && discount === 0 && openCats.length > 1 && (
              <div className="text-xs font-light italic leading-normal text-dust">
                Tambah layanan {cats.includes("barbershop") ? "nail" : "barbershop"} untuk hemat {shop.bundlePct}%.
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-rule pt-4 tabular-nums">
              <span className="lux-label">Estimasi total</span><span className="font-serif text-[32px] leading-none">{formatRupiah(total)}</span>
            </div>
            <button onClick={primary} disabled={!primaryOk} className="btn-gold w-full">
              {sending ? "Memproses…" : PRIMARY[FLOW[stepIdx]][0]}
            </button>
            <span className="text-center text-[11px] uppercase tracking-[0.18em] text-stone">Bayar di toko setelah layanan</span>
          </aside>
        )}
      </div>

      {/* BAR BAWAH (layar sempit) */}
      {inFlow && (sel.length > 0 || view !== "layanan") && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-rule bg-lux/95 px-[22px] pb-4 pt-3 backdrop-blur-md min-[900px]:hidden">
          <div className="flex min-w-0 flex-1 flex-col tabular-nums">
            <span className="font-serif text-2xl leading-tight">{formatRupiah(total)}</span>
            <span className="truncate text-[11px] uppercase tracking-[0.14em] text-stone">
              {lines.length} layanan{time && ` · ${+date.slice(8, 10)} ${fmtUtc(date, { month: "short" })} ${time}`}
            </span>
          </div>
          <button onClick={primary} disabled={!primaryOk} className="btn-gold h-[52px] px-6">
            {sending ? "Memproses…" : PRIMARY[FLOW[stepIdx]][1]}
          </button>
        </div>
      )}

      {toast && (
        <div role="status" className="fixed bottom-[100px] left-1/2 z-30 -translate-x-1/2 whitespace-nowrap bg-cream px-5 py-3 text-sm font-medium text-lux shadow-[0_12px_32px_rgba(0,0,0,0.5)]">
          {toast}
        </div>
      )}
    </div>
  );
}
