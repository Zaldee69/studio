"use client";

import { CAT_NAME, CAT_TONE, type Cat } from "@/lib/domain/category";
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { STATUS } from "@/lib/domain/status";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { useDayAppointments, useDayTransactions } from "../counter/hooks";
import type { Master } from "../counter/types";

/** Beranda manajer: 5 kartu, perlu perhatian, tim hari ini, berikutnya. Semua realtime. */
export function Beranda({ master }: { master: Master }) {
  const today = jktDate();
  const [now, setNow] = useState(() => new Date().toISOString());
  useEffect(() => { const t = setInterval(() => setNow(new Date().toISOString()), 60_000); return () => clearInterval(t); }, []);
  const { data: appts } = useDayAppointments(today);
  const { data: txs } = useDayTransactions(today);
  const prevMonth = new Date(Date.UTC(+today.slice(0, 4), +today.slice(5, 7) - 2, 1)).toISOString().slice(0, 10);
  const { data: side } = useRealtimeTable(["appointments", "transactions", "customers", "staff_time_off", "stock_moves", "stock_opnames", "payroll_periods",
    "sop_logs", "sop_approvals", "maintenance_logs"], async () => {
    const supabase = createClient();
    const week0 = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 864e5).toISOString().slice(0, 10);
    const [{ data: churn, count }, { data: online }, { count: pendingOff }, { data: funnel }, { count: reorder }, { count: drafts }, { data: prevPeriod },
      { data: sop }, { data: tasks }, { data: ins }] = await Promise.all([
      supabase.from("customer_stats").select("customer_id", { count: "exact" }).eq("is_churn", true).limit(3),
      supabase.from("appointments").select("id, start_at, customer:customers(name)").eq("source", "online").eq("status", "booked")
        .gte("start_at", new Date().toISOString()).order("start_at").limit(3),
      supabase.from("staff_time_off").select("id", { count: "exact", head: true }).eq("status", "pending"),
      supabase.rpc("funnel_summary"),
      supabase.from("stock_levels").select("item_id", { count: "exact", head: true }).eq("status", "reorder").eq("active", true),
      supabase.from("stock_opnames").select("id", { count: "exact", head: true }).eq("status", "draft"),
      supabase.from("payroll_periods").select("status").eq("month", prevMonth).maybeSingle(),
      supabase.rpc("sop_day", { p_date: today, p_shift: 1 }),
      supabase.rpc("maintenance_status", {}),
      supabase.rpc("kpi_insights", { p_from: week0, p_to: today }),
    ]);
    const { data: names } = await supabase.from("customers").select("name").in("id", (churn ?? []).map((c) => c.customer_id!));
    return { followCount: count ?? 0, followNames: (names ?? []).map((n) => n.name), online: online ?? [], pendingOff: pendingOff ?? 0,
      reorder: reorder ?? 0, drafts: drafts ?? 0, prevOpen: prevPeriod?.status !== "closed",
      sop: sop as { done: number; total: number; closed: boolean; approval: unknown } | null,
      tasks: ((tasks ?? []) as { name: string; status: string; days_left: number }[]).filter((t) => t.status === "overdue" || t.status === "due"),
      insight: ((ins ?? []) as { message: string; href: string }[])[0] ?? null,
      funnel: funnel as { landing: number; booking_open: number; service: number; time: number; booked: number; online_bookings: number } | null };
  });

  const live = (appts ?? []).filter((a) => a.status !== "cancelled");
  const okTx = (txs ?? []).filter((t) => !t.voided_at);
  const by = (s: string) => live.filter((a) => a.status === s);
  const svcName = (id: string) => master.services.find((s) => s.id === id)?.name;
  const unpaidTotal = by("completed").reduce((a, x) => a + x.appointment_services.reduce((b, s) => b + (master.services.find((v) => v.id === s.service_id)?.price ?? 0), 0), 0);
  const upcoming = live.filter((a) => (a.status === "booked" || a.status === "arrived") && a.end_at >= now);
  const b = master.base;

  const tiles = [
    { label: "Omzet hari ini", value: formatRupiah(okTx.reduce((a, t) => a + t.total, 0)), sub: `${okTx.length} transaksi`, href: `${b}/kasir?tab=riwayat` },
    { label: "Booking hari ini", value: String(live.length), sub: `${live.filter((a) => a.source === "online").length} dari online`, href: `${b}/jadwal` },
    { label: "Sedang dilayani", value: String(by("in_service").length), sub: `${by("arrived").length} menunggu`, href: `${b}/jadwal` },
    { label: "Belum bayar", value: String(by("completed").length), sub: `estimasi ${formatRupiah(unpaidTotal)}`, href: `${b}/kasir` },
    { label: "Perlu follow-up", value: String(side?.followCount ?? "…"), sub: `belum kembali > ${master.shop.churnWeeks} minggu`, href: `${b}/pelanggan?filter=follow` },
  ];
  const prevLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${prevMonth}T00:00:00Z`));
  const alerts = [
    ...(side?.sop && !side.sop.closed && !side.sop.approval ? [{ text: `Checklist sterilisasi hari ini ${side.sop.done}/${side.sop.total}${side.sop.done >= side.sop.total ? " — siap diotorisasi" : ", belum lengkap"}`, cta: "SOP", href: `${b}/sop`, dot: "#1F7A45", bg: "#F3FAF5", border: "#9ED7B2" }] : []),
    ...(side?.tasks ?? []).map((t) => ({ text: t.days_left < 0 ? `${t.name} terlambat ${-t.days_left} hari` : `${t.name} jatuh tempo hari ini`, cta: "Perawatan", href: `${b}/sop#perawatan`, dot: "#E06C1A", bg: "#FFF6EE", border: "#F2B488" })),
    ...(side?.insight ? [{ text: side.insight.message, cta: "Analitik lengkap", href: `${b}/analitik${side.insight.href}`, dot: "#5646C8", bg: "#F6F5FF", border: "#C9C3F0" }] : []),
    ...(side?.reorder ? [{ text: `${side.reorder} item di bawah ambang reorder`, cta: "Daftar belanja", href: `${b}/inventaris`, dot: "#D23B3B", bg: "#FFF7F7", border: "#EFA3A3" }] : []),
    ...(side?.drafts ? [{ text: `${side.drafts} stok opname draft belum disetujui`, cta: "Opname", href: `${b}/inventaris?tab=opname`, dot: "#C99500", bg: "#FFFDF3", border: "#EBCB67" }] : []),
    ...(side?.prevOpen ? [{ text: `Periode gaji ${prevLabel} belum ditutup`, cta: "SDM", href: `${b}/sdm?bulan=${prevMonth.slice(0, 7)}`, dot: "#5646C8", bg: "#F6F5FF", border: "#C9C3F0" }] : []),
    ...(side?.pendingOff ? [{ text: `${side.pendingOff} pengajuan izin staf menunggu persetujuan`, cta: "Izin staf", href: `${b}/izin`, dot: "#C99500", bg: "#FFFDF3", border: "#EBCB67" }] : []),
    ...(by("completed").length ? [{ text: `${by("completed").length} tagihan selesai belum dibayar · ${by("completed").map((a) => a.customer?.name ?? "Walk-in").join(", ")}`, cta: "Kasir", href: `${b}/kasir`, dot: STATUS.completed.dot, bg: "#FFF7F7", border: "#EFA3A3" }] : []),
    ...(side?.online ?? []).map((o) => ({ text: `Booking online: ${o.customer?.name ?? "Tamu"} · ${formatTanggal(o.start_at)} ${formatJam(o.start_at)}`, cta: "Jadwal", href: `${b}/jadwal`, dot: "#1C1B19", bg: "#FAF8F4", border: "#E4E0D6" })),
    ...(side?.followCount ? [{ text: `${side.followCount} pelanggan belum kembali > ${master.shop.churnWeeks} minggu${side.followNames.length ? ` · ${side.followNames.join(", ")}` : ""}`, cta: "Pelanggan", href: `${b}/pelanggan?filter=follow`, dot: "#2F6FD6", bg: "#F5F9FF", border: "#A9C9F5" }] : []),
  ];
  const team = master.staff.filter((s) => s.active).map((s) => {
    const mine = live.filter((a) => a.staff_id === s.id);
    const serving = mine.find((a) => a.status === "in_service");
    const next = mine.find((a) => (a.status === "booked" || a.status === "arrived") && a.start_at >= now);
    const st = serving ? { label: `Melayani ${serving.customer?.name ?? "walk-in"}`, s: STATUS.in_service }
      : next ? { label: `Berikutnya ${formatJam(next.start_at)}`, s: STATUS.booked } : { label: "Kosong", s: STATUS.paid };
    return { s, st, count: mine.length };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex min-h-12 flex-wrap items-center gap-3">
        <div className="flex flex-1 flex-col gap-0.5 max-sm:basis-full">
          <h1 className="font-display text-[28px] font-bold tracking-tight">Selamat datang, {master.userName.split(" ")[0]}</h1>
          <span className="text-[13px] text-muted">{formatTanggal(new Date())} · Ringkasan manajemen</span>
        </div>
        <Link href={`${b}/kasir`} className="btn-ghost h-11 rounded-[10px]">Buka kasir</Link>
        <Link href={`${b}/jadwal?new=1`} className="btn-ink h-11">Booking baru</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-3 xl:grid-cols-5">
        {tiles.map((k) => (
          <Link key={k.label} href={k.href} className="flex flex-col gap-1.5 rounded-[14px] border border-line bg-card p-4 hover:border-[#CFC8B8]">
            <span className="text-xs font-semibold text-muted">{k.label}</span>
            <b className="font-display text-[26px] tabular">{k.value}</b>
            <span className="text-xs text-muted tabular">{k.sub}</span>
          </Link>
        ))}
      </div>

      {side?.funnel && (
        <section aria-label="Booking online minggu ini" className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[14px] border border-line bg-card p-4">
          <div className="flex flex-col"><span className="text-xs font-semibold text-muted">Booking online minggu ini</span>
            <b className="font-display text-[26px] tabular">{side.funnel.online_bookings}</b></div>
          <div className="flex flex-col"><span className="text-xs font-semibold text-muted">Tingkat penyelesaian booking</span>
            <b className="font-display text-[26px] tabular">{side.funnel.booking_open ? `${Math.round((side.funnel.booked / side.funnel.booking_open) * 100)}%` : "—"}</b></div>
          <ol className="flex flex-1 flex-wrap items-center gap-2 text-xs text-muted tabular" aria-label="Tahapan">
            {([["landing", "Lihat landing"], ["booking_open", "Buka booking"], ["service", "Pilih layanan"], ["time", "Pilih jam"], ["booked", "Booking berhasil"]] as const).map(([k, l], i) => (
              <li key={k} className="flex items-center gap-2">{i > 0 && <span aria-hidden="true">→</span>}<span className="rounded-full bg-paper px-2.5 py-1"><b className="text-ink">{side.funnel![k]}</b> {l}</span></li>
            ))}
          </ol>
        </section>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1000px]:grid-cols-2">
        <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">Perlu perhatian</h2>
          {!alerts.length ? <span className="text-sm font-semibold text-[#1F7A45]">Semua aman hari ini.</span> : alerts.map((a, i) => (
            <Link key={i} href={a.href} className="flex min-h-[52px] items-center gap-3 rounded-[10px] border px-3 py-2.5" style={{ background: a.bg, borderColor: a.border }}>
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.dot }} />
              <span className="min-w-0 flex-1 text-sm font-semibold">{a.text}</span>
              <span className="text-xs font-bold text-[#4A463F]">{a.cta} →</span>
            </Link>
          ))}
        </section>
        <section className="flex flex-col gap-2.5 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">Tim hari ini</h2>
          {team.map(({ s, st, count }) => (
            <div key={s.id} className="flex min-h-11 items-center gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full font-bold"
                style={{ background: CAT_TONE[s.category].bg, color: CAT_TONE[s.category].fg }}>{s.name.charAt(0)}</span>
              <span className="flex min-w-0 flex-1 flex-col"><b className="text-sm">{s.name}</b><span className="truncate text-xs text-muted">{CAT_NAME[s.category as Cat]} · {count} booking hari ini</span></span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-bold" style={{ background: st.s.bg, color: st.s.fg }}>
                <span className="size-[7px] rounded-full" style={{ background: st.s.dot }} />{st.label}
              </span>
            </div>
          ))}
        </section>
      </div>

      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
        <div className="flex items-center"><h2 className="flex-1 text-base font-bold">Berikutnya hari ini</h2>
          <Link href={`${b}/jadwal`} className="flex h-11 items-center rounded-lg border border-[#D9D4C8] px-3 text-xs font-bold">Lihat jadwal</Link></div>
        {!upcoming.length ? <span className="text-sm text-muted">Tidak ada booking lagi hari ini.</span> : upcoming.slice(0, 6).map((a) => (
          <div key={a.id} className="grid min-h-11 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[#F0EDE6] py-1.5 text-sm tabular sm:grid-cols-[70px_1.2fr_1.6fr_1fr] sm:py-0">
            <b>{formatJam(a.start_at)}</b>
            <span className="flex min-w-0 items-center gap-1.5"><b className="truncate">{a.customer?.name ?? "Walk-in"}</b>
              {a.source === "online" && <span className="rounded bg-ink px-1.5 text-[10px] font-bold text-white">Online</span>}</span>
            <span className="truncate text-[#4A463F] max-sm:col-start-2 max-sm:col-end-4 max-sm:row-start-2 max-sm:text-xs">{a.appointment_services.map((s) => svcName(s.service_id)).join(", ")}</span>
            <span className="flex items-center gap-1.5 text-xs font-semibold max-sm:col-start-3 max-sm:row-start-1"><span className="size-2 rounded-full" style={{ background: STATUS[a.status].dot }} />
              {master.staff.find((s) => s.id === a.staff_id)?.name}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
