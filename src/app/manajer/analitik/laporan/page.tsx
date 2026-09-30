import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { Bullet, HBars, Legend, LineChart, StackedWeekly } from "@/features/analitik/charts";
import { CAT_LABEL, COLOR, rb } from "@/features/analitik/palette";
import { loadAnalytics } from "@/features/analitik/load";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { BAND_LABEL, bandStatus, deltaLabel, pct1 } from "@/lib/domain/kpi";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Laporan bulanan KPI" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

// Laporan bulanan A4 — sumber angka sama dengan layar Analitik (loadAnalytics → fungsi kpi_*).
export default async function Laporan({ searchParams }: PageProps<"/manajer/analitik/laporan">) {
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(one(sp.bulan)) ? one(sp.bulan) : jktDate().slice(0, 7);
  const end = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const [d, { data: shop }] = await Promise.all([
    loadAnalytics({ periode: "kustom", dari: `${month}-01`, sampai: end }),
    (await createClient()).from("settings").select("shop_name, shop_address").single(),
  ]);
  const c = d.summary.current, t = d.summary.targets, dl = d.summary.delta;
  const title = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  const pc = (v: number | null | undefined) => (v == null ? "—" : `${pct1(v)}%`);
  const m = (v: number | null | undefined) => (v == null ? "—" : formatRupiah(v));
  const retailSt = bandStatus(c.retail_ratio ?? null, t.retail_min, t.retail_max);
  const cards: [string, string, number | null | undefined, string][] = [
    ["Omzet", m(c.omzet), dl.omzet, `${c.tx_count ?? 0} transaksi · AOV ${m(c.aov_all)}`],
    ["AOV Barbershop", m(c.aov_barbershop), dl.aov_barbershop, `target ${formatRupiah(t.aov_barbershop)}`],
    ["AOV Nail", m(c.aov_nail), dl.aov_nail, `target ${formatRupiah(t.aov_nail)}`],
    ["Rasio ritel", pc(c.retail_ratio), dl.retail_ratio, `${retailSt ? BAND_LABEL[retailSt] : "—"} · pita ${t.retail_min}–${t.retail_max}%`],
    ["Utilisasi rata-rata", pc(c.utilization_avg), dl.utilization_avg, `target ${t.utilization}%`],
  ];
  return (
    <div className="flex flex-col gap-4">
      <style>{"@page { size: A4; margin: 12mm } @media print { body { background: #fff } section { break-inside: avoid } }"}</style>
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/manajer/analitik" className="btn-ghost h-11">← Analitik</Link>
        <form className="flex gap-2"><input type="month" name="bulan" aria-label="Bulan" defaultValue={month} className="input h-11 w-44" /><button className="btn-ghost h-11">Tampilkan</button></form>
        <PrintButton />
      </div>
      <article className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 rounded-[14px] border border-line bg-card p-6 text-sm print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-col border-b-2 border-ink pb-2">
          <b className="font-display text-xl">{shop?.shop_name}</b><span className="text-xs text-muted">{shop?.shop_address}</span>
          <h1 className="mt-2 font-display text-2xl font-bold">Laporan KPI bulanan · {title}</h1>
          <span className="text-xs text-muted tabular">{d.label} · dibanding {d.prevLabel} · dibuat {formatTanggal(new Date())} {formatJam(new Date())}</span>
        </header>
        <section className="grid grid-cols-5 gap-2 tabular">
          {cards.map(([k, v, delta, sub]) => (
            <div key={k} className="flex flex-col rounded-[10px] border border-line p-2.5"><span className="text-[11px] text-muted">{k}</span><b className="text-lg">{v}</b>
              <span className="text-[11px] font-bold">{deltaLabel(delta ?? null)}</span><span className="text-[10px] text-muted">{sub}</span></div>
          ))}
        </section>
        {!!d.insights.length && (
          <section className="rounded-[10px] bg-[#F6F5FF] p-3"><b>Insight</b><ul className="mt-1 list-inside list-disc">{d.insights.map((i) => <li key={i.code}>{i.message}</li>)}</ul></section>
        )}
        <section>
          <b>AOV harian per kategori</b>
          <Legend items={[{ label: "Barbershop", color: COLOR.barbershop }, { label: "Nail & Spa", color: COLOR.nail }, { label: "Target", color: "#6B665C", dashed: true }]} />
          <LineChart labels={d.daily.map((r) => `${Number(r.day.slice(8))}`)} ariaLabel="AOV harian"
            series={(["barbershop", "nail"] as const).map((k) => ({ key: k, label: CAT_LABEL[k], color: COLOR[k], values: d.daily.map((r) => r[`aov_${k}`]) }))}
            targets={[{ label: `Target barbershop ${rb(t.aov_barbershop)}`, value: t.aov_barbershop, color: COLOR.barbershop }, { label: `Target nail ${rb(t.aov_nail)}`, value: t.aov_nail, color: COLOR.nail }]} />
        </section>
        <section className="flex flex-col gap-4">
          <div><b>Utilisasi</b>
            <HBars ariaLabel="Utilisasi" target={{ value: t.utilization, label: `Target ${t.utilization}%` }}
              rows={d.util.map((u) => ({ label: u.name, value: u.pct ?? 0, color: COLOR[u.type], caption: `${pc(u.pct)} · ${Math.round(u.sold_minutes / 60)} dari ${Math.round(u.available_minutes / 60)} jam` }))} />
          </div>
          <div className="flex max-w-md flex-col gap-2"><b>Rasio ritel : jasa</b>
            <span className="text-2xl font-bold tabular">{pc(d.retail.ratio)}</span>
            <Bullet value={d.retail.ratio} min={d.retail.min} max={d.retail.max} />
            <span className="text-xs text-muted tabular">Ritel {formatRupiah(d.retail.retail_revenue)} · jasa {formatRupiah(d.retail.service_revenue)}</span>
          </div>
        </section>
        <section><b>Omzet per kategori</b>
          <p className="text-xs tabular">{d.mix.mix.map((x) => `${CAT_LABEL[x.category]} ${formatRupiah(x.revenue)} (${pc(x.share)})`).join(" · ")}</p>
          <StackedWeekly weeks={d.mix.weekly} />
        </section>
        <section className="grid grid-cols-5 gap-2 text-xs tabular">
          {[["Pelanggan baru", String(d.customers.new_customers)], ["Kembali", String(d.customers.returning)], [`Tingkat kembali ${d.customers.window_days} hr`, pc(d.customers.return_rate)],
            ["Churn", String(d.customers.churn_count)], ["Follow-up", `${d.customers.followup_converted}/${d.customers.followup_sent} (${pc(d.customers.followup_rate)})`]].map(([k, v]) => (
            <div key={k} className="rounded-[10px] border border-line p-2"><span className="text-muted">{k}</span><b className="block text-base">{v}</b></div>
          ))}
        </section>
      </article>
    </div>
  );
}
