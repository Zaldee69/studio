"use client";

import { buttonClass } from "@/components/ui/button";
import { CAT_NAME, CAT_TONE, catNameOf, type Cat } from "@/lib/domain/category";
import Link from "next/link";
import { StaffAvatar } from "@/components/staff-avatar";
import { useEffect, useState } from "react";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { STATUS } from "@/lib/domain/status";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { useDayAppointments, useDayTransactions } from "../counter/hooks";
import type { Master } from "../counter/types";
import { apptName } from "@/lib/domain/guest";

/** Beranda manajer: 5 kartu, perlu perhatian, tim hari ini, berikutnya. Semua realtime. */
export function Beranda({ master }: { master: Master }) {
  const today = jktDate();
  const [showAll, setShowAll] = useState(false);
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
      { data: sop }, { data: tasks }, { data: ins }, { data: priv }, { data: act }, { data: shopSet }, { data: wa }] = await Promise.all([
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
      supabase.rpc("staff_private"), supabase.from("staff").select("id").eq("active", true),
      supabase.from("settings").select("google_review_url").single(),
      supabase.from("wa_health").select("status, since").maybeSingle(),
    ]);
    // pengingat tutup gaji hanya bila ada staf aktif yang dibayar bulanan (staf mingguan ditutup di Komisi mingguan)
    const monthly = (priv ?? []).some((p) => p.pay_monthly && (act ?? []).some((a) => a.id === p.id));
    const { data: names } = await supabase.from("customers").select("name").in("id", (churn ?? []).map((c) => c.customer_id!));
    return { waDown: wa?.status === "down" ? wa.since : null, noReviewUrl: !shopSet?.google_review_url, followCount: count ?? 0, followNames: (names ?? []).map((n) => n.name), online: online ?? [], pendingOff: pendingOff ?? 0,
      reorder: reorder ?? 0, drafts: drafts ?? 0, prevOpen: monthly && prevPeriod?.status !== "closed",
      sop: sop as { done: number; total: number; closed: boolean; approval: unknown } | null,
      tasks: ((tasks ?? []) as { name: string; status: string; days_left: number }[]).filter((t) => t.status === "overdue" || t.status === "due"),
      insight: ((ins ?? []) as { message: string; href: string }[])[0] ?? null,
      funnel: funnel as { landing: number; booking_open: number; service_pick?: number; service: number; slots?: number; time: number; booked: number; online_bookings: number } | null };
  });

  const live = (appts ?? []).filter((a) => a.status !== "cancelled");
  const okTx = (txs ?? []).filter((t) => !t.voided_at);
  const by = (s: string) => live.filter((a) => a.status === s);
  const svcName = (id: string) => master.services.find((s) => s.id === id)?.name;
  const unpaidTotal = by("completed").reduce((a, x) => a + x.appointment_services.reduce((b, s) => b + (master.services.find((v) => v.id === s.service_id)?.price ?? 0), 0), 0);
  const upcoming = live.filter((a) => (a.status === "booked" || a.status === "arrived") && a.end_at >= now);
  const b = master.base;

  // Pendapatan hari ini per layanan, dikelompokkan per kategori (omzet bersih setelah diskon, tanpa void & tips = kartu Omzet)
  const byCat = (["barbershop", "massage", "nail", "retail"] as const).map((c) => {
    const lines = new Map<string, { qty: number; rev: number }>();
    for (const it of okTx.flatMap((t) => t.transaction_items).filter((i) => i.category === c)) {
      const l = lines.get(it.name) ?? { qty: 0, rev: 0 };
      l.qty++; l.rev += it.net_amount; lines.set(it.name, l);
    }
    return { c, lines: [...lines].sort((x, y) => y[1].rev - x[1].rev), total: [...lines.values()].reduce((a, l) => a + l.rev, 0) };
  }).filter((g) => g.lines.length);
  const dayTotal = byCat.reduce((a, g) => a + g.total, 0);

  const tiles = [
    { label: "Omzet hari ini", value: formatRupiah(okTx.reduce((a, t) => a + t.total, 0)), sub: `${okTx.length} transaksi`, href: `${b}/kasir?tab=riwayat` },
    { label: "Booking hari ini", value: String(live.length), sub: `${live.filter((a) => a.source === "online").length} dari online`, href: `${b}/jadwal` },
    { label: "Sedang dilayani", value: String(by("in_service").length), sub: `${by("arrived").length} menunggu`, href: `${b}/jadwal` },
    { label: "Belum bayar", value: String(by("completed").length), sub: `estimasi ${formatRupiah(unpaidTotal)}`, href: `${b}/kasir` },
    { label: "Perlu follow-up", value: String(side?.followCount ?? "…"), sub: `belum kembali > ${master.shop.churnWeeks} minggu`, href: `${b}/pelanggan?filter=follow` },
  ];
  const prevLabel = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${prevMonth}T00:00:00Z`));
  // Urutan = tingkat desakan: 1 mendesak (uang/stok/terlambat), 2 perlu keputusan, 3 info. Tiap baris: judul pendek, rincian, tombol berupa kata kerja.
  type Alert = { sev: 1 | 2 | 3; title: string; detail?: string; cta: string; href: string };
  const shortDay = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Jakarta" });
  const unpaid = by("completed");
  const alerts: Alert[] = [
    ...(side?.waDown ? [{ sev: 1 as const, title: "WhatsApp terputus", detail: `Sejak ${formatJam(side.waDown)}. Pengingat, konfirmasi, struk, dan ulasan belum terkirim. Scan QR ulang di dashboard Wablas.`, cta: "Lihat log", href: `${b}/pengaturan?tab=notifikasi` }] : []),
    ...(unpaid.length ? [{ sev: 1 as const, title: `${unpaid.length} tagihan belum dibayar`, detail: `${unpaid.map((a) => apptName(a)).join(", ")} · estimasi ${formatRupiah(unpaidTotal)}`, cta: "Buka kasir", href: `${b}/kasir` }] : []),
    ...(side?.reorder ? [{ sev: 1 as const, title: `${side.reorder} stok perlu dibeli`, detail: "Sudah di bawah batas minimum", cta: "Daftar belanja", href: `${b}/inventaris` }] : []),
    ...(side?.tasks ?? []).map((t) => ({ sev: (t.days_left < 0 ? 1 : 2) as 1 | 2, title: t.days_left < 0 ? `${t.name} terlambat ${-t.days_left} hari` : `${t.name} jatuh tempo hari ini`, cta: "Lihat perawatan", href: `${b}/sop#perawatan` })),
    ...(side?.sop && !side.sop.closed && !side.sop.approval ? [{ sev: 2 as const, title: side.sop.done >= side.sop.total ? "Checklist sterilisasi siap disetujui" : "Checklist sterilisasi belum lengkap", detail: `${side.sop.done} dari ${side.sop.total} langkah selesai`, cta: "Buka SOP", href: `${b}/sop` }] : []),
    ...(side?.noReviewUrl ? [{ sev: 2 as const, title: "Tautan ulasan Google belum diisi", detail: "Pesan minta ulasan otomatis belum terkirim ke siapa pun", cta: "Isi tautan", href: `${b}/pengaturan?tab=pesan` }] : []),
    ...(side?.pendingOff ? [{ sev: 2 as const, title: `${side.pendingOff} izin staf menunggu keputusan`, cta: "Putuskan", href: `${b}/izin` }] : []),
    ...(side?.drafts ? [{ sev: 2 as const, title: `${side.drafts} stok opname menunggu persetujuan`, cta: "Periksa opname", href: `${b}/inventaris?tab=opname` }] : []),
    ...(side?.prevOpen ? [{ sev: 2 as const, title: `Gaji ${prevLabel} belum ditutup`, cta: "Tutup gaji", href: `${b}/sdm?bulan=${prevMonth.slice(0, 7)}` }] : []),
    ...((side?.online ?? []).length ? [{ sev: 3 as const, title: "Booking online berikutnya", detail: (side?.online ?? []).map((o) => `${o.customer?.name ?? "Tamu"} · ${shortDay.format(new Date(o.start_at))} ${formatJam(o.start_at)}`).join(" | "), cta: "Lihat jadwal", href: `${b}/jadwal` }] : []),
    ...(side?.followCount ? [{ sev: 3 as const, title: `${side.followCount} pelanggan perlu dihubungi`, detail: `Belum kembali > ${master.shop.churnWeeks} minggu${side.followNames.length ? ` · ${side.followNames.join(", ")}` : ""}`, cta: "Hubungi", href: `${b}/pelanggan?filter=follow` }] : []),
    ...(side?.insight ? [{ sev: 3 as const, title: side.insight.message, cta: "Lihat analitik", href: `${b}/analitik${side.insight.href}` }] : []),
  ].sort((x, y) => x.sev - y.sev);
  const SEV = { 1: { dot: "#D94B42", label: "Mendesak" }, 2: { dot: "#C58A2B", label: "Perlu keputusan" }, 3: { dot: "#527A9A", label: "Info" } } as const;
  const shownAlerts = showAll ? alerts : alerts.slice(0, 5);
  const urgent = alerts.filter((x) => x.sev === 1).length;
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
          <h1 className="font-display text-[28px] font-medium tracking-tight">Selamat datang, {master.userName.split(" ")[0]}</h1>
          <span className="text-[13px] text-muted">{formatTanggal(new Date())} · Ringkasan manajemen</span>
        </div>
        <Link href={`${b}/kasir`} className={buttonClass("outline", "h-11 rounded-[14px]")}>Buka kasir</Link>
        <Link href={`${b}/jadwal?new=1`} className={buttonClass("default", "h-11")}>Booking baru</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 min-[1000px]:grid-cols-3 xl:grid-cols-5">
        {tiles.map((k) => (
          <Link key={k.label} href={k.href} className="flex flex-col gap-1.5 rounded-3xl border border-line bg-card p-4 hover:border-[#CBCFD6]">
            <span className="text-[13px] font-medium text-muted">{k.label}</span>
            <b className="font-display text-[28px] font-semibold leading-tight tracking-tight tabular">{k.value}</b>
            <span className="text-xs text-muted tabular">{k.sub}</span>
          </Link>
        ))}
      </div>

      <section aria-label="Pendapatan per layanan hari ini" className="flex flex-col gap-3 rounded-3xl border border-line bg-card p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-base font-semibold">Pendapatan per layanan hari ini</h2>
          <b className="font-display text-xl font-semibold tabular">{formatRupiah(dayTotal)}</b>
        </div>
        {!byCat.length ? <span className="text-sm text-muted">Belum ada transaksi hari ini.</span> : (
          <div className="grid gap-3 min-[700px]:grid-cols-2 xl:grid-cols-4">
            {byCat.map((g) => (
              <div key={g.c} className="flex flex-col gap-1.5 rounded-[14px] bg-paper p-3">
                <div className="flex items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ background: g.c === "retail" ? "#8A8C84" : CAT_TONE[g.c].fg }} />
                  <b className="flex-1 text-sm font-medium">{g.c === "retail" ? "Produk ritel" : CAT_NAME[g.c]}</b>
                  <span className="text-xs text-muted tabular">{dayTotal ? Math.round((g.total * 100) / dayTotal) : 0}%</span>
                </div>
                <b className="font-display text-xl font-semibold tabular">{formatRupiah(g.total)}</b>
                <ul className="flex flex-col gap-0.5 border-t border-[#E0E2E6] pt-1.5 text-[13px] tabular">
                  {g.lines.map(([name, l]) => (
                    <li key={name} className="flex justify-between gap-2"><span className="min-w-0 truncate text-muted">{name} ×{l.qty}</span><span className="font-medium">{formatRupiah(l.rev)}</span></li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {side?.funnel && (() => {
        const f = side.funnel;
        const steps = [["Melihat halaman depan", f.landing], ["Membuka form booking", f.booking_open], ["Memilih layanan", f.service], ["Memilih jam", f.time], ["Booking berhasil", f.booked]] as const;
        const top = Math.max(f.landing, 1);
        // tahap dengan penurunan terbesar (orang yang berhenti di situ)
        const drops = steps.slice(1).map(([l, n], i) => ({ from: steps[i][0], to: l, lost: steps[i][1] - n }));
        const worst = drops.reduce((m, d) => (d.lost > m.lost ? d : m), drops[0]);
        const rate = f.booking_open ? Math.round((f.booked / f.booking_open) * 100) : null;
        return (
          <section aria-label="Booking online 7 hari terakhir" className="flex flex-col gap-4 rounded-3xl border border-line bg-card p-4 min-[900px]:flex-row min-[900px]:gap-8">
            <div className="flex flex-col gap-3 min-[900px]:w-64 min-[900px]:shrink-0">
              <h2 className="text-base font-semibold">Booking online, 7 hari terakhir</h2>
              <div className="flex flex-col"><b className="font-display text-[32px] font-semibold leading-none tracking-tight tabular">{f.online_bookings}</b><span className="text-[13px] text-muted">booking masuk dari website</span></div>
              <p className="text-[13px] leading-snug text-muted">
                {rate === null ? "Belum ada yang membuka form booking." : <>Dari setiap 100 orang yang membuka form, <b className="font-semibold text-ink">{rate}</b> sampai booking berhasil.</>}
                {worst && worst.lost > 0 && <> Paling banyak berhenti saat <b className="text-ink">{worst.to.toLowerCase()}</b> ({worst.lost} orang).</>}
              </p>
            </div>
            <ol className="flex min-w-0 flex-1 flex-col gap-2" aria-label="Tahapan pelanggan">
              {steps.map(([l, n], i) => (
                <li key={l} className="grid grid-cols-[150px_minmax(0,1fr)_40px] items-center gap-3 text-[13px] max-sm:grid-cols-[110px_minmax(0,1fr)_32px]">
                  <span className={i === steps.length - 1 ? "font-semibold" : "text-muted"}>{l}</span>
                  <span className="h-6 rounded-md bg-paper"><span className="block h-full rounded-md" style={{ width: `${Math.max((n / top) * 100, n ? 2 : 0)}%`, background: i === steps.length - 1 ? "#268052" : "var(--color-accent)", opacity: i === steps.length - 1 ? 1 : 0.85 - i * 0.14 }} /></span>
                  <b className="text-right tabular">{n}</b>
                </li>
              ))}
            </ol>
          </section>
        );
      })()}

      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 min-[1000px]:grid-cols-2">
        <section aria-label="Perlu perhatian" className="flex flex-col gap-1 rounded-3xl border border-line bg-card p-4">
          <div className="mb-1 flex items-center gap-2">
            <h2 className="text-base font-semibold">Perlu perhatian</h2>
            {alerts.length > 0 && <span className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular ${urgent ? "bg-[#FBEEEC] text-[#6B2427]" : "bg-paper text-muted"}`}>{urgent ? `${urgent} mendesak` : `${alerts.length} hal`}</span>}
          </div>
          {!alerts.length ? <span className="py-2 text-sm font-medium text-[#268052]">Semua aman hari ini.</span> : (
            <ul className="flex flex-col divide-y divide-line">
              {shownAlerts.map((a, i) => (
                <li key={i}>
                  <Link href={a.href} className="group flex min-h-14 items-center gap-3 rounded-[14px] px-1 py-2 hover:bg-paper">
                    <span role="img" aria-label={SEV[a.sev].label} title={SEV[a.sev].label} className="size-2.5 shrink-0 rounded-full" style={{ background: SEV[a.sev].dot }} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="text-sm font-medium">{a.title}</b>
                      {a.detail && <span className="truncate text-[13px] text-muted">{a.detail}</span>}
                    </span>
                    <span className="shrink-0 rounded-[10px] border border-line px-2.5 py-1.5 text-xs font-semibold group-hover:border-[#CBCFD6]">{a.cta}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {alerts.length > 5 && <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-1 h-10 self-start rounded-[10px] px-2 text-xs font-semibold text-muted hover:text-ink">{showAll ? "Tampilkan lebih sedikit" : `Tampilkan ${alerts.length - 5} lainnya`}</button>}
        </section>
        <section className="flex flex-col gap-2.5 rounded-3xl border border-line bg-card p-4">
          <h2 className="text-base font-semibold">Tim hari ini</h2>
          {team.map(({ s, st, count }) => (
            <div key={s.id} className="flex min-h-11 items-center gap-3">
              <StaffAvatar name={s.name} category={s.category} photoPath={s.photo_path} size={40} />
              <span className="flex min-w-0 flex-1 flex-col"><b className="text-sm font-medium">{s.name}</b><span className="truncate text-[13px] text-muted">{catNameOf(s.category)} · {count} booking hari ini</span></span>
              <span className="flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-xs font-semibold" style={{ background: st.s.bg, color: st.s.fg }}>
                <span className="size-[7px] rounded-full" style={{ background: st.s.dot }} />{st.label}
              </span>
            </div>
          ))}
        </section>
      </div>

      <section className="flex flex-col gap-2 rounded-3xl border border-line bg-card p-4">
        <div className="flex items-center"><h2 className="flex-1 text-base font-semibold">Berikutnya hari ini</h2>
          <Link href={`${b}/jadwal`} className="flex h-11 items-center rounded-[14px] border border-[#D5D8DE] px-3 text-xs font-semibold">Lihat jadwal</Link></div>
        {!upcoming.length ? <span className="text-sm text-muted">Tidak ada booking lagi hari ini.</span> : upcoming.slice(0, 6).map((a) => (
          <div key={a.id} className="grid min-h-11 grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-x-2.5 border-b border-[#E0E2E6] py-1.5 text-sm tabular sm:grid-cols-[70px_1.2fr_1.6fr_1fr] sm:py-0">
            <b className="font-semibold">{formatJam(a.start_at)}</b>
            <span className="flex min-w-0 items-center gap-1.5"><b className="truncate font-medium">{apptName(a)}</b>
              {a.source === "online" && <span className="rounded bg-accent px-1.5 text-[10px] font-semibold text-white">Online</span>}</span>
            <span className="truncate text-[13px] text-muted max-sm:col-start-2 max-sm:col-end-4 max-sm:row-start-2 max-sm:text-xs">{a.appointment_services.map((s) => svcName(s.service_id)).join(", ")}</span>
            <span className="flex items-center gap-1.5 text-[13px] text-muted max-sm:col-start-3 max-sm:row-start-1"><span className="size-2 rounded-full" style={{ background: STATUS[a.status].dot }} />
              {master.staff.find((s) => s.id === a.staff_id)?.name}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
