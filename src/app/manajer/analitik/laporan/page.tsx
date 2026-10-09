import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { HBars, Legend, LineChart, StackedWeekly } from "@/features/analitik/charts";
import { loadAnalytics } from "@/features/analitik/load";
import { loadOwnerReport } from "@/features/analitik/owner";
import { CAT_NAME, change, SUMMARY_ROWS, WEEKDAY, type RowKind } from "@/features/analitik/owner-rows";
import { CAT_LABEL, COLOR, rb } from "@/features/analitik/palette";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { BAND_LABEL, bandStatus, pct1 } from "@/lib/domain/kpi";
import { attainment, marginPct } from "@/lib/domain/owner";
import { OwnerPeriodForm } from "./period-form";

export const metadata = { title: "Laporan owner" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const m = (v: number | null | undefined) => (v == null ? "—" : formatRupiah(Math.round(v)));
const pc = (v: number | null | undefined) => (v == null ? "—" : `${pct1(v)}%`);
const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("id-ID"));
const fmt = (k: RowKind, v: number | null | undefined) => (k === "money" ? m(v) : k === "pct" ? pc(v) : n(v));
function Change({ kind, cur, prev, lowerBetter }: { kind: RowKind; cur: number | null | undefined; prev: number | null | undefined; lowerBetter?: boolean }) {
  const c = change(kind, cur, prev);
  if (c.value == null) return <span className="text-muted">—</span>;
  const good = lowerBetter ? c.value < 0 : c.value > 0;
  return (
    <span className={c.value === 0 ? "text-muted" : good ? "text-[#1F7A45]" : "text-[#A12A2A]"}>
      {c.value > 0 ? "▲" : c.value < 0 ? "▼" : "="} {pct1(Math.abs(c.value))}{c.unit === "%" ? "%" : " poin"}
    </span>
  );
}
const th = "border-b border-ink px-1.5 py-1 text-left text-[11px] font-bold";
const td = "border-b border-line px-1.5 py-1 tabular";
const num = `${td} text-right`;

// Laporan owner A4 (Cetak / PDF) + Excel. Angka dari owner_report() & kpi_* — definisi sama dengan layar Analitik.
export default async function OwnerReportPage({ searchParams }: PageProps<"/manajer/analitik/laporan">) {
  const sp = await searchParams;
  const q = { periode: one(sp.periode), nilai: one(sp.nilai), dari: one(sp.dari), sampai: one(sp.sampai), bulan: one(sp.bulan) };
  const { p, r, shop } = await loadOwnerReport(q);
  const d = await loadAnalytics({ periode: "kustom", dari: p.from, sampai: p.to });
  const s = r.summary, f = r.finance, t = r.targets;
  const qs = new URLSearchParams(Object.entries({ periode: p.kind, nilai: p.value, dari: p.from, sampai: p.to }).filter(([, v]) => v) as [string, string][]);
  const hppPct = f.net > 0 ? (f.hpp * 100) / f.net : null;
  const payroll = r.payroll.complete ? r.payroll.total_pay : null;
  const afterPay = payroll == null ? null : f.net - f.hpp - payroll;
  const retailSt = bandStatus(s.retail_ratio ?? null, t.retail_min, t.retail_max);
  const staffPay = (id: string) => r.payroll.by_staff[id];
  const topServices = r.services.filter((x) => x.category !== "retail").slice(0, 10);
  const topRetail = r.services.filter((x) => x.category === "retail").slice(0, 10);
  const inv = r.operations.inventory;
  const cash = f.payments.cash + f.payments.qris + f.deposit.topup_paid;

  return (
    <div className="flex flex-col gap-4">
      {/* Bagian boleh terpotong antar halaman (bagian panjang yang dipaksa utuh meninggalkan halaman kosong); yang dijaga utuh:
          judul bagian dengan isinya, baris tabel, kartu metrik, grafik. */}
      <style>{"@page { size: A4; margin: 11mm } @media print { body { background: #fff } article h2 { break-after: avoid } tr, .keep { break-inside: avoid } }"}</style>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <Link href="/manajer/analitik" className="btn-ghost h-11">← Analitik</Link>
        <OwnerPeriodForm kind={p.kind} value={p.value} from={p.from} to={p.to} today={jktDate()} />
        <PrintButton />
        <a href={`/manajer/analitik/laporan/excel?${qs}`} className="btn-ghost h-11" download>Unduh Excel</a>
      </div>

      <article aria-label="Laporan owner" className="mx-auto flex w-full max-w-[210mm] flex-col gap-5 rounded-[14px] border border-line bg-card p-6 text-[13px] max-sm:p-3 max-sm:[&_table]:block max-sm:[&_table]:overflow-x-auto print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-col border-b-2 border-ink pb-2">
          <b className="font-display text-xl">{shop.name}</b><span className="text-xs text-muted">{shop.address}</span>
          <h1 className="mt-2 font-display text-2xl font-bold">Laporan owner · {p.label}</h1>
          <span className="text-xs text-muted tabular">
            {formatTanggal(`${p.from}T12:00:00+07:00`)} – {formatTanggal(`${p.to}T12:00:00+07:00`)} · dibanding {p.previous.label}{p.sameCompare ? "" : ` & ${p.lastYear.label}`} · dibuat {formatTanggal(new Date())} {formatJam(new Date())}
          </span>
        </header>

        {/* 1. Ringkasan */}
        <section aria-labelledby="h-ring">
          <h2 id="h-ring" className="mb-1 font-display text-lg font-bold">1. Ringkasan</h2>
          <div className="mb-2 grid grid-cols-2 gap-2 min-[700px]:grid-cols-4 print:grid-cols-4">
            {[["Omzet bersih", m(s.net), t.revenue ? `${pc(attainment(s.net, t.revenue))} dari target ${m(t.revenue)}` : "target belum diisi"],
              ["Margin kotor", m(s.margin), `${pc(s.margin_pct)} dari omzet`],
              ["Transaksi", n(s.tx_count), `AOV ${m(s.aov)}`],
              ["Kontribusi setelah gaji", m(afterPay), payroll == null ? "hanya untuk bulan/kuartal/tahun penuh" : `gaji & komisi ${m(payroll)}`]].map(([k, v, sub]) => (
              <div key={k} className="keep rounded-[10px] border border-line p-2.5"><span className="text-[11px] text-muted">{k}</span><b className="block text-lg tabular">{v}</b><span className="text-[10px] text-muted">{sub}</span></div>
            ))}
          </div>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr><th className={th}>Metrik</th><th className={`${th} text-right`}>{p.label}</th><th className={`${th} text-right`}>vs {p.previous.label}</th>{!p.sameCompare && <th className={`${th} text-right`}>vs {p.lastYear.label}</th>}<th className={`${th} text-right`}>Target · capaian</th></tr></thead>
            <tbody>
              {SUMMARY_ROWS.map((row) => {
                const cur = s[row.key] as number | null, target = row.target?.(t) ?? null;
                return (
                  <tr key={row.key}>
                    <td className={td}>{row.label}</td>
                    <td className={`${num} font-bold`}>{fmt(row.kind, cur)}</td>
                    <td className={num}><Change kind={row.kind} cur={cur} prev={r.previous[row.key] as number | null} lowerBetter={row.lowerBetter} /> <span className="text-[10px] text-muted">({fmt(row.kind, r.previous[row.key] as number | null)})</span></td>
                    {!p.sameCompare && <td className={num}><Change kind={row.kind} cur={cur} prev={r.last_year[row.key] as number | null} lowerBetter={row.lowerBetter} /> <span className="text-[10px] text-muted">({fmt(row.kind, r.last_year[row.key] as number | null)})</span></td>}
                    <td className={num}>{row.key === "retail_ratio" ? `${retailSt ? BAND_LABEL[retailSt] : "—"} (${t.retail_min}–${t.retail_max}%)` : target ? `${fmt(row.kind, target)} · ${pc(attainment(cur, target))}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!!r.insights.length && (
            <div className="mt-2 rounded-[10px] bg-[#F6F5FF] p-3"><b>Insight</b><ul className="mt-1 list-inside list-disc">{r.insights.map((i) => <li key={i.code}>{i.message}</li>)}</ul></div>
          )}
        </section>

        {/* 2. Keuangan */}
        <section aria-labelledby="h-keu">
          <h2 id="h-keu" className="mb-1 font-display text-lg font-bold">2. Keuangan</h2>
          <div className="grid gap-4 min-[700px]:grid-cols-2 print:grid-cols-2">
            <table className="w-full border-collapse text-[12px]"><tbody>
              {([["Omzet kotor (harga normal)", f.gross, false], ["− Diskon paket & promo", -f.discount, false], ...(f.discount_promo ? [["   termasuk promo booking online", -f.discount_promo, false]] : []), ["= Omzet bersih", f.net, true],
                 [`− HPP bahan & barang (${pc(hppPct)})`, -f.hpp, false], [`= Margin kotor (${pc(marginPct(f.net, f.hpp))})`, f.net - f.hpp, true],
                 ...(payroll == null ? [] : [["− Gaji & komisi staf", -payroll, false], ["= Kontribusi setelah gaji", afterPay, true]]),
                 ["Biaya perawatan fasilitas (dicatat)", f.maintenance_cost, false]] as [string, number, boolean][]).map(([k, v, b]) => (
                <tr key={k} className={b ? "font-bold" : ""}><td className={td}>{k}</td><td className={num}>{m(v)}</td></tr>
              ))}
            </tbody></table>
            <div className="flex flex-col gap-2">
              <table className="w-full border-collapse text-[12px]">
                <thead><tr><th className={th}>Uang masuk</th><th className={`${th} text-right`}>Rp</th></tr></thead>
                <tbody>
                  <tr><td className={td}>Tunai (transaksi)</td><td className={num}>{m(f.payments.cash)}</td></tr>
                  <tr><td className={td}>QRIS (transaksi)</td><td className={num}>{m(f.payments.qris)}</td></tr>
                  <tr><td className={td}>Top-up deposit ({f.deposit.topup_count}×)</td><td className={num}>{m(f.deposit.topup_paid)}</td></tr>
                  <tr className="font-bold"><td className={td}>Total uang masuk</td><td className={num}>{m(cash)}</td></tr>
                  <tr><td className={td}>Dibayar pakai saldo deposit</td><td className={num}>{m(f.payments.deposit)}</td></tr>
                  <tr><td className={td}>Void: {f.void_count} transaksi</td><td className={num}>{m(f.void_amount)}</td></tr>
                </tbody>
              </table>
              <p className="text-[11px] text-muted">
                Deposit: bonus diberikan {m(f.deposit.bonus)} · saldo pelanggan per {formatTanggal(`${p.to}T12:00:00+07:00`)} <b>{m(f.deposit.balance_end)}</b> (kewajiban layanan yang belum dipakai).
              </p>
            </div>
          </div>
          <table className="mt-3 w-full border-collapse text-[12px]">
            <thead><tr>{["Kategori", "Item", "Omzet kotor", "Diskon", "Omzet bersih", "HPP", "Margin", "Margin %"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {f.by_category.map((c) => (
                <tr key={c.category}><td className={td}>{CAT_NAME[c.category]}</td><td className={num}>{n(c.items)}</td><td className={num}>{m(c.gross)}</td><td className={num}>{m(c.discount)}</td>
                  <td className={num}>{m(c.net)}</td><td className={num}>{m(c.hpp)}</td><td className={num}>{m(c.margin)}</td><td className={num}>{pc(marginPct(c.net, c.hpp))}</td></tr>
              ))}
            </tbody>
          </table>
          {r.payroll.months.length > 0 && (
            <p className="mt-1 text-[11px] text-muted">
              Gaji & komisi per bulan: {r.payroll.months.map((x) => `${new Intl.DateTimeFormat("id-ID", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${x.month}T00:00:00Z`))} ${m(x.total_pay)}${x.closed ? "" : " (belum ditutup)"}`).join(" · ")}
              {" "}— komisi jasa {m(r.payroll.commission_service)}, ritel {m(r.payroll.commission_retail)}, subsidi minimum {m(r.payroll.subsidy)}, penyesuaian {m(r.payroll.adjustments)}.
            </p>
          )}
          <div className="keep mt-3">
            <b className="text-[12px]">Omzet per minggu</b>
            <p className="text-[11px] tabular">{d.mix.mix.map((x) => `${CAT_LABEL[x.category]} ${formatRupiah(x.revenue)} (${pc(x.share)})`).join(" · ")}</p>
            <StackedWeekly weeks={d.mix.weekly} />
          </div>
        </section>

        {/* 3. Staf & layanan */}
        <section aria-labelledby="h-staf">
          <h2 id="h-staf" className="mb-1 font-display text-lg font-bold">3. Staf & layanan</h2>
          <table className="w-full border-collapse text-[11.5px]">
            <thead><tr>{["Staf", "Transaksi", "Omzet", "Jasa", "Ritel", "AOV", "Upsell", "Utilisasi", "Dilayani / no-show", "Gaji & komisi"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {r.staff.map((x) => (
                <tr key={x.staff_id}>
                  <td className={td}>{x.name} <span className="text-[10px] text-muted">{CAT_NAME[x.category]}{x.active ? "" : " · nonaktif"}</span></td>
                  <td className={num}>{n(x.tx)}</td><td className={num}>{m(x.revenue)}</td><td className={num}>{m(x.service_revenue)}</td><td className={num}>{m(x.retail_revenue)}</td>
                  <td className={num}>{m(x.aov)}</td><td className={num}>{pc(x.upsell_rate)}</td><td className={num}>{pc(x.utilization)}</td>
                  <td className={num}>{x.served} / {x.no_show}</td><td className={num}>{staffPay(x.staff_id) == null ? "—" : m(staffPay(x.staff_id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 grid items-start gap-4 min-[700px]:grid-cols-2 print:grid-cols-2">
            {([["Layanan terlaris", topServices], ["Produk ritel terlaris", topRetail]] as const).map(([title, rows]) => (
              <table key={title} className="w-full border-collapse text-[11.5px]">
                <thead><tr><th className={th}>{title}</th><th className={`${th} text-right`}>Qty</th><th className={`${th} text-right`}>Omzet</th><th className={`${th} text-right`}>Margin %</th></tr></thead>
                <tbody>
                  {rows.length ? rows.map((x) => <tr key={x.name}><td className={td}>{x.name}</td><td className={num}>{n(x.qty)}</td><td className={num}>{m(x.revenue)}</td><td className={num}>{pc(x.margin_pct)}</td></tr>)
                    : <tr><td className={td} colSpan={4}>Belum ada penjualan.</td></tr>}
                </tbody>
              </table>
            ))}
          </div>
          <div className="keep mt-3">
            <b className="text-[12px]">AOV harian per kategori</b>
            <Legend items={[{ label: "Barbershop", color: COLOR.barbershop }, { label: "Nail Art", color: COLOR.nail }, { label: "Target", color: "#6B665C", dashed: true }]} />
            <LineChart labels={d.daily.map((x) => `${Number(x.day.slice(8))}`)} ariaLabel="AOV harian"
              series={(["barbershop", "nail"] as const).map((k) => ({ key: k, label: CAT_LABEL[k], color: COLOR[k], values: d.daily.map((x) => x[`aov_${k}`]) }))}
              targets={[{ label: `Target barbershop ${rb(t.aov_barbershop)}`, value: t.aov_barbershop, color: COLOR.barbershop }, { label: `Target nail ${rb(t.aov_nail)}`, value: t.aov_nail, color: COLOR.nail }]} />
          </div>
        </section>

        {/* 4. Pelanggan & deposit */}
        <section aria-labelledby="h-pel">
          <h2 id="h-pel" className="mb-1 font-display text-lg font-bold">4. Pelanggan & booking</h2>
          <div className="grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
            {[["Pelanggan baru", n(r.customers.new_customers)], ["Pelanggan kembali", n(r.customers.returning)],
              [`Kembali ≤ ${r.customers.window_days} hari`, `${pc(r.customers.return_rate)} (${r.customers.return_back}/${r.customers.return_eligible})`],
              ["Belum kembali (churn, saat ini)", n(r.customers.churn_count)],
              ["Follow-up berhasil", `${r.customers.followup_converted}/${r.customers.followup_sent} (${pc(r.customers.followup_rate)})`],
              ["Porsi booking online", pc(r.online.share_online)], ["Batal (online)", pc(r.online.cancel_rate)], ["No-show", `${pc(r.online.no_show_rate)} (${r.online.no_show})`],
            ].map(([k, v]) => <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-base tabular">{v}</b></div>)}
          </div>
          <p className="mt-1 text-[11px] text-muted tabular">Corong booking online: {n(r.online.landing)} kunjungan landing → {n(r.online.booking_open)} buka booking → {n(r.online.booked)} booking.</p>
          <table className="mt-2 w-full border-collapse text-[11.5px]">
            <thead><tr><th className={th}>Pelanggan teratas</th><th className={`${th} text-right`}>Kunjungan</th><th className={`${th} text-right`}>Belanja</th><th className={`${th} text-right`}>Saldo deposit</th></tr></thead>
            <tbody>
              {r.customers.top.length ? r.customers.top.map((c, i) => <tr key={i}><td className={td}>{c.name}</td><td className={num}>{c.visits}</td><td className={num}>{m(c.spend)}</td><td className={num}>{m(c.deposit_balance)}</td></tr>)
                : <tr><td className={td} colSpan={4}>Belum ada transaksi pelanggan terdaftar.</td></tr>}
            </tbody>
          </table>
        </section>

        {/* 5. Operasional & kepatuhan */}
        <section aria-labelledby="h-ops">
          <h2 id="h-ops" className="mb-1 font-display text-lg font-bold">5. Operasional & kepatuhan</h2>
          <HBars ariaLabel="Utilisasi" target={{ value: t.utilization, label: `Target ${t.utilization}%` }}
            rows={r.operations.utilization.map((u) => ({ label: u.name, value: u.pct ?? 0, color: COLOR[u.type], caption: `${pc(u.pct)} · ${Math.round(u.sold_minutes / 60)} dari ${Math.round(u.available_minutes / 60)} jam` }))} />
          <div className="mt-3 grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
            {[["Jam tersibuk", r.operations.peak_hours.slice(0, 3).map((h) => `${WEEKDAY[h.weekday]} ${String(h.hour).padStart(2, "0")}.00`).join(", ") || "—"],
              ["Kepatuhan SOP", `${pc(r.operations.sop.compliance_pct)} (${r.operations.sop.ok}/${r.operations.sop.operational} hari)`],
              ["Perawatan fasilitas", `${r.operations.maintenance_done} selesai · ${r.operations.maintenance_overdue_now} terlambat kini`],
              ["Biaya perawatan", m(f.maintenance_cost)],
              ["Nilai stok akhir", m(inv.value_end)], ["Stok masuk / terpakai", `${m(inv.in_value)} / ${m(inv.out_value)}`],
              ["Stok menipis (kini)", n(inv.low_stock_now)],
              ["Selisih pemakaian bahan", inv.opnames >= 2 ? `${inv.usage_flagged} bahan ditandai · ${m(inv.usage_variance_value)}` : "butuh ≥ 2 opname di periode"],
            ].map(([k, v]) => <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-[13px] tabular">{v}</b></div>)}
          </div>
          <p className="mt-2 text-[10px] text-muted">
            Catatan: omzet bersih = harga setelah diskon, tanpa transaksi void. Margin kotor = omzet bersih − HPP (bahan jasa & harga pokok ritel).
            Kontribusi belum dikurangi biaya tetap yang tidak dicatat aplikasi (sewa, listrik, dll.). Nilai stok memakai harga pokok rata-rata saat ini.
          </p>
        </section>
      </article>
    </div>
  );
}

