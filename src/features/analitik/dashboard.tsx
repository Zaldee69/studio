"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, useOnline, useToast } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { formatRupiah } from "@/lib/domain/format";
import { BAND_LABEL, bandStatus, deltaLabel, funnel, pct1, targetStatus } from "@/lib/domain/kpi";
import { createClient } from "@/lib/supabase/client";
import { Bullet, DataTable, Funnel, HBars, Heatmap, Legend, LineChart, StackedWeekly } from "./charts";
import { CAT_LABEL, COLOR, rb } from "./palette";

type Period = Record<string, number | null>;
export type AnalyticsData = {
  periode: string; from: string; to: string; label: string; prevLabel: string; category: string; staff: string; monthForReport: string;
  summary: { current: Period; previous: Period; delta: Period; targets: { aov_barbershop: number; aov_nail: number; retail_min: number; retail_max: number; utilization: number; min_tx: number } };
  daily: { day: string; aov_barbershop: number | null; aov_nail: number | null; tx_barbershop: number; tx_nail: number; omzet: number }[];
  drivers: { category: string; tx_count: number; avg_services: number | null; upsell_rate: number | null; bundle_pct: number | null }[];
  util: { resource_id: string; name: string; type: "barbershop" | "nail"; sold_minutes: number; planned_minutes: number; available_minutes: number; pct: number | null; pct_planned: number | null; n_actual: number; planned_vs_actual_avg: number | null }[];
  heat: { weekday: number; hour: number; minutes_avg: number; closed: boolean }[];
  duration: { service_id: string; name: string; planned_min: number; actual_avg: number; diff_avg: number; n: number }[];
  retail: { retail_revenue: number; service_revenue: number; ratio: number | null; min: number; max: number; top: { name: string; qty: number; revenue: number }[] };
  mix: { mix: { category: "barbershop" | "nail" | "massage" | "retail"; revenue: number; share: number | null }[]; weekly: { week: string; barbershop: number; nail: number; massage?: number; retail: number }[] };
  customers: { new_customers: number; returning: number; return_rate: number | null; return_eligible: number; return_back: number; churn_count: number; followup_sent: number; followup_converted: number; followup_rate: number | null; window_days: number };
  online: { landing: number; booking_open: number; booked: number; share_online: number | null; cancel_rate: number | null; no_show_rate: number | null; online_appts: number; all_appts: number; no_show: number };
  insights: { code: string; message: string; href: string }[];
  staffList: { id: string; name: string }[];
  settings: { revenue_target_monthly: number; aov_target_barbershop: number; aov_target_nail: number; retail_ratio_min: number; retail_ratio_max: number; utilization_target: number;
    insight_aov_gap_pct: number; insight_low_util_pct: number; kpi_min_tx_for_stable: number };
};

const PERIODS = [["hari", "Hari ini"], ["7", "7 hari"], ["30", "30 hari"], ["bulan", "Bulan ini"], ["lalu", "Bulan lalu"]] as const;
const pctOr = (v: number | null | undefined, suffix = "%") => (v === null || v === undefined ? "—" : `${pct1(v)}${suffix}`);
const money = (v: number | null | undefined) => (v === null || v === undefined ? "—" : formatRupiah(Math.round(v)));
const dm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;
const csv = (name: string, rows: (string | number | null)[][]) => downloadText(`${name}.csv`, toCsv(rows));

function Chip({ tone, icon, label }: { tone: "ok" | "warn" | "bad" | "info"; icon: string; label: string }) {
  const c = { ok: ["#D9F2E1", "#144D2A"], warn: ["#FFF1C2", "#5A4300"], bad: ["#FFDADA", "#6E1616"], info: ["#EEEBE4", "#4A463F"] }[tone];
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: c[0], color: c[1] }}><span aria-hidden="true">{icon}</span>{label}</span>;
}
function Delta({ d }: { d: number | null | undefined }) {
  const v = d ?? null;
  return <span className={`text-xs font-bold tabular ${v === null ? "text-muted" : v >= 0 ? "text-[#1F7A45]" : "text-[#A12A2A]"}`}>{deltaLabel(v)}</span>;
}
function Section({ id, title, children, onCsv, extra }: { id: string; title: string; children: React.ReactNode; onCsv?: () => void; extra?: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="flex scroll-mt-16 flex-col gap-3 rounded-[14px] border border-line bg-card p-4 xl:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${id}-h`} className="flex-1 font-display text-lg font-bold">{title}</h2>
        {extra}
        {onCsv && <button onClick={onCsv} className="btn-ghost h-11 px-3 text-xs">Unduh CSV</button>}
      </div>
      {children}
    </section>
  );
}

export function AnalyticsDashboard({ d }: { d: AnalyticsData }) {
  const router = useRouter();
  const cur = d.summary.current, t = d.summary.targets, delta = d.summary.delta;
  const q = (over: Record<string, string>) => {
    const p = new URLSearchParams({ periode: "kustom", dari: d.from, sampai: d.to, ...(d.category ? { kategori: d.category } : {}), ...(d.staff ? { staf: d.staff } : {}), ...over });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `?${p}`;
  };
  const tx = Number(cur.tx_count ?? 0);
  const retailSt = bandStatus(cur.retail_ratio ?? null, t.retail_min, t.retail_max);
  const aovSt = (k: "barbershop" | "nail") => targetStatus(cur[`aov_${k}`] ?? null, k === "barbershop" ? t.aov_barbershop : t.aov_nail);
  const utilSt = targetStatus(cur.utilization_avg ?? null, t.utilization);
  const cats = (d.category ? [d.category] : ["barbershop", "nail"]) as ("barbershop" | "nail")[];
  const [planned, setPlanned] = useState(false);
  const drv = (c: string) => d.drivers.find((x) => x.category === c);

  const cards = [
    { href: "#omzet", title: "Omzet", value: money(cur.omzet), delta: delta.omzet, chip: null, sub: `${tx} transaksi · AOV ${money(cur.aov_all)}` },
    ...(cats.includes("barbershop") ? [{ href: "#aov", title: "AOV Barbershop", value: money(cur.aov_barbershop), delta: delta.aov_barbershop,
      chip: aovSt("barbershop"), sub: `target ${formatRupiah(t.aov_barbershop)} · ${cur.tx_barbershop ?? 0} tx` }] : []),
    ...(cats.includes("nail") ? [{ href: "#aov", title: "AOV Nail", value: money(cur.aov_nail), delta: delta.aov_nail,
      chip: aovSt("nail"), sub: `target ${formatRupiah(t.aov_nail)} · ${cur.tx_nail ?? 0} tx` }] : []),
    ...(!d.category ? [{ href: "#ritel", title: "Rasio ritel", value: pctOr(cur.retail_ratio), delta: delta.retail_ratio, chip: retailSt, band: true, sub: `pita ${t.retail_min}–${t.retail_max}%` }] : []),
    { href: "#utilisasi", title: "Utilisasi rata-rata", value: pctOr(cur.utilization_avg), delta: delta.utilization_avg, chip: utilSt, sub: `target ${t.utilization}%` },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <h1 className="flex-1 font-display text-[28px] font-bold tracking-tight">Analitik KPI</h1>
        <Link href={`/manajer/analitik/laporan?bulan=${d.monthForReport}`} className="btn-ghost h-11">Laporan owner (PDF/Excel)</Link>
      </div>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <div role="group" aria-label="Periode" className="flex flex-wrap gap-1.5">
          {PERIODS.map(([k, l]) => (
            <Link key={k} href={q({ periode: k, dari: "", sampai: "" })} aria-current={d.periode === k ? "true" : undefined}
              className="inline-flex h-11 items-center rounded-full border border-[#D9D4C8] bg-card px-4 text-[13px] font-bold aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-white">{l}</Link>
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-1.5" onChange={(e) => { const f = e.currentTarget; if ((e.target as HTMLElement).tagName === "SELECT") f.requestSubmit(); }}>
          <input type="hidden" name="periode" value="kustom" />
          <input type="date" name="dari" aria-label="Dari" defaultValue={d.from} className="input h-11 w-40" />
          <input type="date" name="sampai" aria-label="Sampai" defaultValue={d.to} className="input h-11 w-40" />
          <select name="kategori" aria-label="Kategori" defaultValue={d.category} className="input h-11 w-36"><option value="">Semua</option><option value="barbershop">Barbershop</option><option value="nail">Nail</option></select>
          <select name="staf" aria-label="Staf" defaultValue={d.staff} className="input h-11 w-36"><option value="">Semua staf</option>{d.staffList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <button className="btn-ink h-11">Terapkan</button>
        </form>
      </div>
      <p className="text-sm text-muted tabular">{d.label} · <b className="text-ink">{tx} transaksi</b> · dibanding {d.prevLabel}</p>
      {tx < t.min_tx && <p role="status" className="rounded-[12px] bg-[#FFF1C2] px-4 py-2.5 text-sm text-[#5A4300]">Data masih sedikit ({tx} transaksi) — angka belum stabil.</p>}

      {!!d.insights.length && (
        <section aria-label="Insight" className="flex flex-col gap-1.5 rounded-[14px] border border-[#C9C3F0] bg-[#F6F5FF] p-4">
          {d.insights.map((i) => (
            <p key={i.code} className="flex flex-wrap items-center gap-2 text-sm">
              <span aria-hidden="true" className="flex size-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">!</span>
              <span className="flex-1">{i.message}</span>
              <a href={i.href} className="flex min-h-11 items-center font-semibold text-accent underline">Lihat</a>
            </p>
          ))}
        </section>
      )}

      <div className="grid gap-3 min-[820px]:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <a key={c.title} href={c.href} className="flex flex-col gap-1 rounded-[14px] border border-line bg-card p-4 hover:border-[#CFC8B8]">
            <span className="text-xs font-semibold text-muted">{c.title}</span>
            <b className="font-display text-2xl tabular">{c.value}</b>
            <span className="flex flex-wrap items-center gap-1.5"><Delta d={c.delta} />
              {c.chip && ("band" in c
                ? <Chip tone={c.chip === "within" ? "ok" : "warn"} icon={c.chip === "within" ? "✓" : c.chip === "below" ? "▼" : "▲"} label={BAND_LABEL[c.chip as "within"]} />
                : <Chip tone={c.chip === "within" ? "ok" : "bad"} icon={c.chip === "within" ? "✓" : "▼"} label={c.chip === "within" ? "Sesuai target" : "Di bawah target"} />)}
            </span>
            <span className="text-xs text-muted tabular">{c.sub}</span>
          </a>
        ))}
      </div>

      <Section id="aov" title="AOV harian per kategori" onCsv={() => csv(`aov-harian-${d.from}_${d.to}`, [["Tanggal", "AOV Barbershop", "Tx Barbershop", "AOV Nail", "Tx Nail", "Omzet"],
        ...d.daily.map((r) => [r.day, r.aov_barbershop, r.tx_barbershop, r.aov_nail, r.tx_nail, r.omzet])])}>
        <Legend items={[...cats.map((k) => ({ label: CAT_LABEL[k], color: COLOR[k] })), ...cats.map((k) => ({ label: `Target ${k === "barbershop" ? "barbershop" : "nail"}`, color: COLOR[k], dashed: true }))]} />
        <LineChart labels={d.daily.map((r) => dm(r.day))} ariaLabel="AOV harian per kategori"
          series={cats.map((k) => ({ key: k, label: CAT_LABEL[k], color: COLOR[k], values: d.daily.map((r) => r[`aov_${k}`]) }))}
          targets={cats.map((k) => ({ label: `Target ${k === "barbershop" ? "barbershop" : "nail"} ${rb(k === "barbershop" ? t.aov_barbershop : t.aov_nail)}`, value: k === "barbershop" ? t.aov_barbershop : t.aov_nail, color: COLOR[k] }))}
          tooltip={(i) => { const r = d.daily[i]; return (
            <><b className="block">{r.day}</b>{cats.map((k) => <span key={k} className="block">{CAT_LABEL[k]}: <b>{money(r[`aov_${k}`])}</b> · {r[`tx_${k}`]} tx</span>)}<span className="block">Omzet {formatRupiah(r.omzet)}</span></>); }} />
        <div className="grid gap-2 min-[820px]:grid-cols-2">
          {cats.map((k) => { const x = drv(k); return (
            <div key={k} className="grid grid-cols-3 gap-2 rounded-[12px] bg-paper p-3 text-center text-xs tabular">
              <span className="col-span-3 text-left text-xs font-bold" style={{ color: k === "nail" ? COLOR.nail : COLOR.barbershop }}>Penggerak {CAT_LABEL[k]}</span>
              <span>Layanan/transaksi<b className="block text-lg">{x?.avg_services == null ? "—" : x.avg_services.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</b></span>
              <span>Tingkat upsell<b className="block text-lg">{pctOr(x?.upsell_rate)}</b></span>
              <span>% bundle<b className="block text-lg">{pctOr(x?.bundle_pct)}</b></span>
            </div>
          ); })}
        </div>
        <DataTable caption="AOV harian" head={["Tanggal", ...cats.flatMap((k) => [`AOV ${CAT_LABEL[k]}`, "Tx"]), "Omzet"]}
          rows={d.daily.map((r) => [r.day, ...cats.flatMap((k) => [money(r[`aov_${k}`]), r[`tx_${k}`]]), formatRupiah(r.omzet)])} />
      </Section>

      <Section id="utilisasi" title="Utilisasi kursi & meja" onCsv={() => csv(`utilisasi-${d.from}_${d.to}`, [["Resource", "Tipe", "Menit terjual (nyata)", "Menit rencana", "Menit tersedia", "Utilisasi nyata %", "Utilisasi rencana %", "Rata-rata nyata−rencana (mnt)"],
        ...d.util.map((u) => [u.name, u.type, Math.round(u.sold_minutes), u.planned_minutes, u.available_minutes, u.pct == null ? "" : pct1(u.pct), u.pct_planned == null ? "" : pct1(u.pct_planned), u.planned_vs_actual_avg == null ? "" : Math.round(u.planned_vs_actual_avg)])])}
        extra={<div role="group" aria-label="Sumber durasi" className="flex gap-1">{[[false, "Nyata"], [true, "Rencana"]].map(([v, l]) => (
          <button key={String(v)} aria-pressed={planned === v} onClick={() => setPlanned(v as boolean)}
            className={`h-11 rounded-full border px-3.5 text-xs font-bold ${planned === v ? "border-ink bg-ink text-white" : "border-[#D9D4C8] bg-card"}`}>{l as string}</button>))}</div>}>
        <Legend items={[{ label: "Barbershop", color: COLOR.barbershop }, { label: "Nail Art", color: COLOR.nail }]} />
        <HBars ariaLabel="Utilisasi per resource" target={{ value: t.utilization, label: `Target ${t.utilization}%` }}
          rows={d.util.map((u) => { const p = (planned ? u.pct_planned : u.pct) ?? 0; const m = planned ? u.planned_minutes : u.sold_minutes;
            return { label: u.name, value: p, color: COLOR[u.type], caption: `${pct1(p)}% · ${(m / 60).toLocaleString("id-ID", { maximumFractionDigits: 1 })} jam dari ${Math.round(u.available_minutes / 60)} jam` }; })} />
        <DataTable caption="Utilisasi" head={["Resource", "Nyata", "Rencana", "Jam terjual", "Jam tersedia", "Nyata − rencana"]}
          rows={d.util.map((u) => [u.name, pctOr(u.pct), pctOr(u.pct_planned), (u.sold_minutes / 60).toLocaleString("id-ID", { maximumFractionDigits: 1 }), Math.round(u.available_minutes / 60),
            u.planned_vs_actual_avg == null ? "—" : `${u.planned_vs_actual_avg > 0 ? "+" : ""}${Math.round(u.planned_vs_actual_avg)} mnt (n=${u.n_actual})`])} />
      </Section>

      <Section id="heatmap" title="Peta panas kesibukan" onCsv={() => csv(`peta-panas-${d.from}_${d.to}`, [["Hari (1=Sen)", "Jam", "Rata-rata menit terjual", "Tutup"], ...d.heat.map((h) => [h.weekday, h.hour, Math.round(h.minutes_avg), h.closed ? "ya" : ""])])}>
        <Heatmap cells={d.heat} />
        <DataTable caption="Peta panas" head={["Hari", "Jam", "Rata-rata menit"]}
          rows={d.heat.filter((h) => !h.closed && h.minutes_avg > 0).sort((a, b) => b.minutes_avg - a.minutes_avg).slice(0, 20)
            .map((h) => [["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"][h.weekday], `${String(h.hour).padStart(2, "0")}:00`, Math.round(h.minutes_avg)])} />
      </Section>

      <Section id="durasi" title="Selisih durasi layanan" onCsv={() => csv(`selisih-durasi-${d.from}_${d.to}`, [["Layanan", "Rencana (mnt)", "Rata-rata nyata (mnt)", "Selisih (mnt)", "n"], ...d.duration.map((r) => [r.name, r.planned_min, Math.round(r.actual_avg), Math.round(r.diff_avg), r.n])])}
        extra={<Link href="/manajer/pengaturan?tab=layanan" className="flex min-h-11 items-center text-xs font-semibold text-accent underline">Pengaturan layanan →</Link>}>
        {!d.duration.length ? <p className="text-sm text-muted">Belum ada layanan dengan ≥ 5 catatan waktu nyata di periode ini.</p> : (
          <table className="w-full text-sm tabular">
            <thead><tr className="text-left text-xs text-muted">{["Layanan", "Rencana", "Rata-rata nyata", "Selisih"].map((h, i) => <th key={h} className={`py-1.5 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>{d.duration.map((r) => (
              <tr key={r.service_id} className="border-t border-[#F0EDE6]">
                <td className="py-2 font-semibold">{r.name}</td><td className="text-right">{r.planned_min} mnt</td><td className="text-right">{Math.round(r.actual_avg)} mnt</td>
                <td className="text-right"><span className="mr-2">{r.diff_avg > 0 ? "+" : ""}{Math.round(r.diff_avg)} mnt (n={r.n})</span>
                  {Math.abs(r.diff_avg) >= 1 && <Chip tone={r.diff_avg > 0 ? "warn" : "info"} icon={r.diff_avg > 0 ? "▲" : "▼"} label={r.diff_avg > 0 ? "molor" : "lebih cepat"} />}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Section>

      {!d.category && (
        <Section id="ritel" title="Ritel" onCsv={() => csv(`ritel-${d.from}_${d.to}`, [["Produk", "Qty", "Pendapatan"], ...d.retail.top.map((p) => [p.name, p.qty, p.revenue]),
          [], ["Pendapatan ritel", "", d.retail.retail_revenue], ["Pendapatan jasa", "", d.retail.service_revenue], ["Rasio %", "", d.retail.ratio == null ? "" : pct1(d.retail.ratio)]])}>
          <div className="grid gap-4 min-[820px]:grid-cols-[1fr_1fr]">
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-baseline gap-2"><b className="font-display text-4xl tabular">{pctOr(d.retail.ratio)}</b>
                {retailSt && <Chip tone={retailSt === "within" ? "ok" : "warn"} icon={retailSt === "within" ? "✓" : retailSt === "below" ? "▼" : "▲"} label={BAND_LABEL[retailSt]} />}</div>
              <span className="text-xs text-muted tabular">Ritel {formatRupiah(d.retail.retail_revenue)} ÷ jasa {formatRupiah(d.retail.service_revenue)} · pita target {d.retail.min}–{d.retail.max}%</span>
              <Bullet value={d.retail.ratio} min={d.retail.min} max={d.retail.max} />
            </div>
            <div>
              <b className="text-sm">Top 5 produk</b>
              {!d.retail.top.length ? <p className="text-sm text-muted">Belum ada penjualan ritel.</p> : (
                <table className="mt-1 w-full text-sm tabular"><tbody>{d.retail.top.map((p) => (
                  <tr key={p.name} className="border-t border-[#F0EDE6]"><td className="py-1.5">{p.name}</td><td className="text-right">{p.qty}×</td><td className="text-right">{formatRupiah(p.revenue)}</td></tr>
                ))}</tbody></table>
              )}
            </div>
          </div>
        </Section>
      )}

      <Section id="omzet" title="Omzet per kategori" onCsv={() => csv(`omzet-kategori-${d.from}_${d.to}`, [["Minggu mulai", "Barbershop", "Nail", "Ritel"], ...d.mix.weekly.map((w) => [w.week, w.barbershop, w.nail, w.retail])])}>
        <div className="flex h-7 gap-[2px] overflow-hidden rounded-md" role="img" aria-label={d.mix.mix.map((m) => `${CAT_LABEL[m.category]} ${pctOr(m.share)}`).join(", ")}>
          {d.mix.mix.filter((m) => m.revenue > 0).map((m) => <div key={m.category} style={{ width: `${m.share}%`, background: COLOR[m.category] }} />)}
        </div>
        <ul className="flex flex-wrap gap-4 text-sm tabular">
          {d.mix.mix.map((m) => <li key={m.category} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: COLOR[m.category] }} />
            {CAT_LABEL[m.category]} <b>{formatRupiah(m.revenue)}</b> <span className="text-muted">({pctOr(m.share)})</span></li>)}
        </ul>
        <StackedWeekly weeks={d.mix.weekly} />
        <DataTable caption="Omzet mingguan" head={["Minggu", "Barbershop", "Nail", "Ritel", "Total"]}
          rows={d.mix.weekly.map((w) => [w.week, formatRupiah(w.barbershop), formatRupiah(w.nail), formatRupiah(w.retail), formatRupiah(w.barbershop + w.nail + w.retail)])} />
      </Section>

      <Section id="pelanggan" title="Pelanggan" extra={<Link href="/manajer/pelanggan?filter=follow" className="flex min-h-11 items-center text-xs font-semibold text-accent underline">Lihat daftar follow-up →</Link>}>
        <div className="grid gap-3 min-[820px]:grid-cols-5">
          {[["Pelanggan baru", String(d.customers.new_customers), "transaksi pertama di periode"],
            ["Pelanggan kembali", String(d.customers.returning), "pernah datang sebelumnya"],
            [`Tingkat kembali ${d.customers.window_days} hari`, pctOr(d.customers.return_rate), `${d.customers.return_back} dari ${d.customers.return_eligible} (pengamatan ≥ ${d.customers.window_days} hari)`],
            ["Churn", String(d.customers.churn_count), "belum kembali lewat batas"],
            ["Efektivitas follow-up", pctOr(d.customers.followup_rate), `${d.customers.followup_sent} dikirimi → ${d.customers.followup_converted} datang`]].map(([k, v, s]) => (
            <div key={k} className="flex flex-col gap-0.5 rounded-[12px] bg-paper p-3"><span className="text-xs font-semibold text-muted">{k}</span><b className="font-display text-2xl tabular">{v}</b><span className="text-xs text-muted">{s}</span></div>
          ))}
        </div>
      </Section>

      <Section id="online" title="Booking online" onCsv={() => csv(`booking-online-${d.from}_${d.to}`, [["Langkah", "Sesi"], ["Lihat landing", d.online.landing], ["Mulai booking", d.online.booking_open], ["Terkonfirmasi", d.online.booked],
        [], ["Porsi online %", d.online.share_online == null ? "" : pct1(d.online.share_online)], ["Pembatalan %", d.online.cancel_rate == null ? "" : pct1(d.online.cancel_rate)], ["No-show %", d.online.no_show_rate == null ? "" : pct1(d.online.no_show_rate)]])}>
        <Funnel steps={funnel([d.online.landing, d.online.booking_open, d.online.booked]).map((s, i) => ({ label: ["Lihat landing", "Mulai booking", "Terkonfirmasi"][i], ...s }))} />
        <div className="grid grid-cols-3 gap-3 text-center tabular">
          <div className="rounded-[12px] bg-paper p-3"><span className="text-xs text-muted">Porsi online</span><b className="block text-xl">{pctOr(d.online.share_online)}</b><span className="text-xs text-muted">{d.online.online_appts} dari {d.online.all_appts} booking</span></div>
          <div className="rounded-[12px] bg-paper p-3"><span className="text-xs text-muted">Pembatalan</span><b className="block text-xl">{pctOr(d.online.cancel_rate)}</b></div>
          <div className="rounded-[12px] bg-paper p-3"><span className="text-xs text-muted">No-show</span><b className="block text-xl">{pctOr(d.online.no_show_rate)}</b><span className="text-xs text-muted">{d.online.no_show} tidak datang</span></div>
        </div>
      </Section>

      <TargetsForm s={d.settings} onSaved={() => router.refresh()} />
    </div>
  );
}

function TargetsForm({ s, onSaved }: { s: AnalyticsData["settings"]; onSaved: () => void }) {
  const toast = useToast(); const online = useOnline();
  const [f, setF] = useState(Object.fromEntries(Object.entries(s).map(([k, v]) => [k, String(v)])) as Record<keyof typeof s, string>);
  const fields: [keyof typeof s, string][] = [
    ["revenue_target_monthly", "Target omzet bersih per bulan (Rp)"],
    ["aov_target_barbershop", "Target AOV barbershop (Rp)"], ["aov_target_nail", "Target AOV nail (Rp)"],
    ["retail_ratio_min", "Rasio ritel minimum (%)"], ["retail_ratio_max", "Rasio ritel maksimum (%)"], ["utilization_target", "Target utilisasi (%)"],
    ["insight_aov_gap_pct", "Insight AOV bila di bawah target > (%)"], ["insight_low_util_pct", "Insight resource sepi bila utilisasi < (%)"],
    ["kpi_min_tx_for_stable", "Catatan \"data masih sedikit\" di bawah (transaksi)"],
  ];
  async function save() {
    const row = Object.fromEntries(fields.map(([k]) => [k, Number(f[k].replace(/[^\d.,]/g, "").replace(",", "."))])) as AnalyticsData["settings"];
    if (Object.values(row).some((v) => !Number.isFinite(v) || v < 0)) return toast("Isi semua angka target", "error");
    if (row.retail_ratio_min > row.retail_ratio_max) return toast("Rasio ritel minimum harus ≤ maksimum", "error");
    const { error } = await createClient().from("settings").update(row).eq("id", true);
    if (error) return toast(error.message, "error");
    toast("Target KPI disimpan"); onSaved();
  }
  return (
    <form id="target" onSubmit={(e) => { e.preventDefault(); save(); }} className="flex scroll-mt-16 flex-col gap-3 rounded-[14px] border border-line bg-card p-4 print:hidden xl:p-5">
      <h2 className="font-display text-lg font-bold">Target KPI</h2>
      <div className="grid gap-3 min-[820px]:grid-cols-4">
        {fields.map(([k, l]) => <Field key={k} label={l} htmlFor={`tg-${k}`}><input id={`tg-${k}`} inputMode="decimal" className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
      <button disabled={!online} className="btn-ink h-11 self-start">Simpan target</button>
    </form>
  );
}
