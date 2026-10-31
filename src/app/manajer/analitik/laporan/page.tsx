import Link from "next/link";
import { PrintButton } from "@/components/print-button";
import { StackedWeekly } from "@/features/analitik/charts";
import { loadOwnerReport, ownerFinanceView, type OwnerNotes } from "@/features/analitik/owner";
import { CAT_NAME } from "@/features/analitik/owner-rows";
import { CAT_LABEL } from "@/features/analitik/palette";
import { EXPENSE_CAT } from "@/lib/domain/expense";
import { coverageNote, customerCoverage } from "@/lib/domain/customer";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { pct1 } from "@/lib/domain/kpi";
import { attainment } from "@/lib/domain/owner";
import { NotesEditor } from "./notes-editor";
import { OwnerPeriodForm } from "./period-form";

export const metadata = { title: "Laporan owner" };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

const m = (v: number | null | undefined) => (v == null ? "—" : formatRupiah(Math.round(v)));
const pc = (v: number | null | undefined) => (v == null ? "—" : `${pct1(v)}%`);
const n = (v: number | null | undefined) => (v == null ? "—" : Math.round(v).toLocaleString("id-ID"));
const th = "border-b border-ink px-1.5 py-1 text-left text-[11px] font-bold";
const td = "border-b border-line px-1.5 py-1 align-top tabular";
const num = `${td} text-right`;
const NA = "Belum tersedia";

/** Perubahan absolut & persen; persen tidak dihitung bila periode lalu 0/kosong (menyesatkan). */
function Delta({ cur, prev, money, lowerBetter }: { cur: number | null; prev: number | null; money?: boolean; lowerBetter?: boolean }) {
  if (cur == null || prev == null) return <span className="text-muted">—</span>;
  const d = cur - prev;
  const good = lowerBetter ? d < 0 : d > 0;
  return (
    <span className={d === 0 ? "text-muted" : good ? "text-[#1F7A45]" : "text-[#A12A2A]"}>
      {d > 0 ? "▲ +" : d < 0 ? "▼ −" : "= "}{money ? m(Math.abs(d)) : n(Math.abs(d))}{prev ? ` (${pct1((Math.abs(d) * 100) / Math.abs(prev))}%)` : ""}
    </span>
  );
}
/** Status capaian target: konsisten di seluruh laporan. */
const status = (a: number | null) => a == null ? <span className="text-muted">Baseline — target belum ditetapkan</span>
  : a >= 100 ? <span className="text-[#1F7A45]">● Tercapai</span> : a >= 90 ? <span className="text-[#8A6100]">● Hampir</span> : <span className="text-[#A12A2A]">● Di bawah target</span>;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="mb-1.5 font-display text-lg font-bold">{children}</h2>;
}
const Empty = ({ children = "Belum diisi manajer." }: { children?: React.ReactNode }) => <p className="text-[12px] italic text-muted">{children}</p>;

// Laporan owner (PDF): mingguan = bagian A–I; bulanan = A–I + laba/rugi lengkap, retensi, stok, evaluasi & rencana.
// Angka dari owner_report() & owner_report_extra(); narasi (A, G, H, I) dari catatan manajer per periode.
export default async function OwnerReportPage({ searchParams }: PageProps<"/manajer/analitik/laporan">) {
  const sp = await searchParams;
  const q = { periode: one(sp.periode), nilai: one(sp.nilai), dari: one(sp.dari), sampai: one(sp.sampai), bulan: one(sp.bulan) };
  const { p, r, shop, charts, extra: x, extraPrev: xp, notes, notesKind } = await loadOwnerReport(q);
  const s = r.summary, pv = r.previous, f = r.finance, t = r.targets;
  const weekly = p.kind === "minggu", monthly = !weekly;
  const qs = new URLSearchParams(Object.entries({ periode: p.kind, nilai: p.value, dari: p.from, sampai: p.to }).filter(([, v]) => v) as [string, string][]);
  const N: OwnerNotes = notes ?? {};

  // Keuangan: kasbon = uang muka gaji (bukan biaya operasional); gaji bulanan sudah dipotong kasbon → biaya staf = gaji + kasbon.
  const { kasbon, marketing, opexRows, fullPayroll, labor, contribution, operating, cashNet } = ownerFinanceView(r, x, weekly);
  const cov = customerCoverage(r.customers.recorded);
  const revTarget = t.revenue || null;
  const title = weekly ? "Laporan Mingguan Owner" : p.kind === "bulan" ? "Laporan Bulanan Owner (Monthly Business Review)" : "Laporan Owner";
  const prevCat: Record<string, number | null> = { barbershop: pv.rev_barbershop, nail: pv.rev_nail, retail: pv.rev_retail, massage: pv.rev_massage ?? null };
  // AOV per transaksi per kategori (definisi yang sama dengan target AOV); kategori lain belum punya AOV & target
  const aovCat: Record<string, [number | null, number | null]> = { barbershop: [s.aov_barbershop, t.aov_barbershop || null], nail: [s.aov_nail, t.aov_nail || null], massage: [s.aov_massage ?? null, null] };
  const cats = f.by_category.filter((c) => c.items > 0 || (prevCat[c.category] ?? 0) > 0);
  const staff = r.staff.filter((st) => st.active || st.tx > 0);

  const perf: [string, number | null, number | null, number | null, boolean, boolean?][] = [
    // metrik, aktual, target, periode lalu, uang?, lebih kecil lebih baik?
    ["Omzet bersih", s.net, revTarget, pv.net, true],
    ["Transaksi selesai", s.tx_count, null, pv.tx_count, false],
    ["Rata-rata nilai transaksi (AOV)", s.aov, null, pv.aov, true],
    ["Booking terjadwal (tanpa yang dibatalkan)", x.bookings, null, xp.bookings, false],
    ["Booking terealisasi (lunas)", x.bookings_paid, null, xp.bookings_paid, false],
    ["Booking dibatalkan", x.bookings_cancelled, null, xp.bookings_cancelled, false, true],
    ["No-show", x.bookings_no_show, null, xp.bookings_no_show, false, true],
    ["Transaksi di-void", s.void_count, null, pv.void_count, false, true],
  ];

  return (
    <div className="flex flex-col gap-4">
      <style>{"@page { size: A4; margin: 11mm } @media print { body { background: #fff } article h2 { break-after: avoid } tr, .keep { break-inside: avoid } }"}</style>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <Link href="/manajer/analitik" className="btn-ghost h-11">← Analitik</Link>
        <OwnerPeriodForm kind={p.kind} value={p.value} from={p.from} to={p.to} today={jktDate()} />
        <PrintButton />
        <a href={`/manajer/analitik/laporan/excel?${qs}`} className="btn-ghost h-11" download>Unduh Excel (data lengkap)</a>
      </div>
      {weekly && !p.partial && p.to < jktDate() && (
        <p className="text-sm text-muted print:hidden">
          Menampilkan minggu lengkap terakhir. Transaksi & pengeluaran minggu berjalan ada di{" "}
          <Link href={`/manajer/analitik/laporan?periode=minggu&nilai=${jktDate()}`} className="font-semibold text-ink underline">laporan minggu ini</Link>.
        </p>
      )}
      {notesKind ? <NotesEditor key={`${notesKind}-${p.from}`} kind={notesKind} periodStart={p.from} initial={notes} suggestions={r.insights.map((i) => i.message)} />
        : <p className="text-sm text-muted print:hidden">Catatan manajer (ringkasan, masalah, keputusan, prioritas) tersedia untuk laporan mingguan & bulanan.</p>}

      <article aria-label="Laporan owner" className="mx-auto flex w-full max-w-[210mm] flex-col gap-5 rounded-[14px] border border-line bg-card p-6 text-[13px] max-sm:p-3 max-sm:[&_table]:block max-sm:[&_table]:overflow-x-auto print:max-w-none print:border-0 print:p-0">
        <header className="flex flex-col border-b-2 border-ink pb-2">
          <b className="font-display text-xl">{shop.name}</b><span className="text-xs text-muted">{shop.address}</span>
          <h1 className="mt-2 font-display text-2xl font-bold">{title}</h1>
          <span className="text-sm font-semibold tabular">{p.label}</span>
          <span className="text-xs text-muted tabular">
            Pembanding: {p.previous.label} · disusun Manajer Operasional · dicetak {formatTanggal(new Date())} {formatJam(new Date())}
          </span>
        </header>

        <section aria-labelledby="h-a">
          <H id="h-a">A. Ringkasan eksekutif</H>
          {N.summary?.trim() ? <p className="whitespace-pre-line leading-relaxed">{N.summary}</p> : <Empty />}
        </section>

        <section aria-labelledby="h-b">
          <H id="h-b">B. Kinerja bisnis</H>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr>{["Metrik", "Aktual", "Target", "Capaian", "Periode lalu", "Perubahan"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {perf.map(([label, cur, target, prev, money, lowerBetter]) => (
                <tr key={label}>
                  <td className={td}>{label}</td>
                  <td className={`${num} font-bold`}>{money ? m(cur) : n(cur)}</td>
                  <td className={num}>{target ? m(target) : "—"}</td>
                  <td className={num}>{target ? <>{pc(attainment(cur, target))} {status(attainment(cur, target))}</> : "—"}</td>
                  <td className={num}>{money ? m(prev) : n(prev)}</td>
                  <td className={num}><Delta cur={cur} prev={prev} money={money} lowerBetter={lowerBetter} /></td>
                </tr>
              ))}
              <tr><td className={td}>Komplain pelanggan</td><td className={num} colSpan={5}><span className="text-muted">{NA} — komplain belum dicatat di sistem</span></td></tr>
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted">
            {revTarget ? `Target omzet = target bulanan ${m(t.revenue_monthly)} diprorata ke ${weekly ? "minggu" : "periode"} ini.` : "Target omzet belum ditetapkan — periode ini dipakai sebagai baseline."}
            {" "}Booking terealisasi {x.bookings ? `${pc((x.bookings_paid * 100) / x.bookings)} dari booking terjadwal` : "—"}; walk-in {n(x.bookings_walk_in)}.
            {" "}Transaksi ≠ booking: satu transaksi bisa melunasi beberapa booking (mis. pasangan), dan penjualan langsung di kasir tanpa booking hanya dihitung sebagai transaksi.
            {" "}Perubahan % tidak dihitung bila periode lalu nol.
          </p>
        </section>

        <section aria-labelledby="h-c">
          <H id="h-c">C. Kinerja per layanan</H>
          <table className="w-full border-collapse text-[12px]">
            <thead><tr>{["Kategori", "Omzet bersih", "Item", "Kontribusi", "AOV / transaksi", "Target AOV", "Periode lalu", "Perubahan"].map((h, i) => <th key={h} className={`${th} ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {cats.length ? cats.map((c) => (
                <tr key={c.category}>
                  <td className={td}>{CAT_NAME[c.category]}</td><td className={`${num} font-bold`}>{m(c.net)}</td><td className={num}>{n(c.items)}</td>
                  <td className={num}>{f.net ? pc((c.net * 100) / f.net) : "—"}</td>
                  <td className={num}>{aovCat[c.category] ? m(aovCat[c.category][0]) : "—"}</td>
                  <td className={num}>{aovCat[c.category]?.[1] ? <>{m(aovCat[c.category][1])} {status(attainment(aovCat[c.category][0], aovCat[c.category][1]))}</> : "—"}</td>
                  <td className={num}>{prevCat[c.category] == null ? <span className="text-muted">{NA}</span> : m(prevCat[c.category])}</td>
                  <td className={num}><Delta cur={c.net} prev={prevCat[c.category]} money /></td>
                </tr>
              )) : <tr><td className={td} colSpan={8}>Belum ada penjualan.</td></tr>}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted">
            AOV / transaksi = omzet kategori ÷ jumlah transaksi yang memuat kategori itu (dasar target AOV). Item = jumlah layanan/produk terjual.
            {" "}Rasio ritel : jasa {pc(s.retail_ratio)} (target {t.retail_min}–{t.retail_max}%).
            Produktivitas antarlayanan tidak dibandingkan dari jumlah pelanggan — durasi & karakter layanan berbeda.
          </p>
          {!!r.insights.length && (
            <div className="keep mt-2 rounded-[10px] bg-[#F5F6F2] p-2.5 text-[12px]">
              <b>Temuan otomatis sistem</b> <span className="text-muted">(observasi dari data, bukan kesimpulan penyebab)</span>
              <ul className="mt-1 list-inside list-disc">{r.insights.map((i) => <li key={i.code}>{i.message}</li>)}</ul>
            </div>
          )}
        </section>

        <section aria-labelledby="h-d">
          <H id="h-d">D. Ringkasan keuangan</H>
          {!!x.hpp_items && (x.hpp_items_filled ?? 0) < x.hpp_items * 0.8 && (
            <p className="keep mb-2 rounded-[8px] bg-[#FBF3DE] px-3 py-2 text-[12px] text-[#5A4300]">
              HPP baru terisi di {x.hpp_items_filled ?? 0} dari {x.hpp_items} item jasa — margin dan laba di bawah masih terlalu tinggi sampai resep bahan & stok lengkap (target ≥80%).
            </p>
          )}
          <div className="grid gap-4 min-[700px]:grid-cols-2 print:grid-cols-2">
            <table className="w-full border-collapse text-[12px]">
              <thead><tr><th className={th}>Laba/rugi operasional {fullPayroll ? "" : "(estimasi)"}</th><th className={`${th} text-right`}>Rp</th></tr></thead>
              <tbody>
                {([["Omzet bersih", f.net, true], ["− Bahan & harga pokok barang (HPP)", -f.hpp, false],
                   [fullPayroll ? "− Gaji & komisi staf (termasuk kasbon)" : "− Upah staf (estimasi)", -labor, false],
                   ["= Margin kontribusi", contribution, true],
                   ...opexRows.map((e) => [`− ${EXPENSE_CAT[e.category]}`, -e.amount, false]),
                   ...(f.maintenance_cost ? [["− Perawatan fasilitas", -f.maintenance_cost, false]] : []),
                   ["= Laba/rugi operasional", operating, true]] as [string, number, boolean][]).map(([k, v, b]) => (
                  <tr key={k} className={b ? "font-bold" : ""}><td className={td}>{k}</td><td className={num}>{m(v)}</td></tr>
                ))}
              </tbody>
            </table>
            <table className="w-full border-collapse text-[12px]">
              <thead><tr><th className={th}>Arus kas tercatat</th><th className={`${th} text-right`}>Rp</th></tr></thead>
              <tbody>
                <tr><td className={td}>Masuk: tunai</td><td className={num}>{m(f.payments.cash)}</td></tr>
                <tr><td className={td}>Masuk: QRIS</td><td className={num}>{m(f.payments.qris)}</td></tr>
                <tr><td className={td}>Masuk: transfer bank</td><td className={num}>{m(f.payments.transfer ?? 0)}</td></tr>
                <tr><td className={td}>Masuk: top-up deposit</td><td className={num}>{m(f.deposit.topup_paid)}</td></tr>
                <tr><td className={td}>Keluar: pengeluaran operasional</td><td className={num}>−{m(f.expenses_total - kasbon + f.maintenance_cost)}</td></tr>
                <tr><td className={td}>Keluar: pembelian stok</td><td className={num}>−{m(x.stock_purchases ?? 0)}</td></tr>
                <tr><td className={td}>Keluar: kasbon staf</td><td className={num}>−{m(kasbon)}</td></tr>
                <tr><td className={td}>Keluar: komisi mingguan dibayar</td><td className={num}>−{m(x.commission_weekly_paid)}</td></tr>
                <tr><td className={td}>Keluar: gaji akhir bulan dibayar</td><td className={num}>−{m(x.payroll_paid ?? 0)}</td></tr>
                <tr className="font-bold"><td className={td}>Arus kas bersih tercatat</td><td className={num}>{m(cashNet)}</td></tr>
              </tbody>
            </table>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
            {[["Selisih tutup kasir", `${m(x.cash_diff_total)}`, `total absolut ${m(x.cash_diff_abs)} · ${x.cash_days_closed}/${x.cash_days} hari ditutup`],
              ["Hari belum tutup kasir", n(x.cash_days_unclosed), x.cash_days_unclosed ? "perlu ditelusuri" : "lengkap"],
              ["Transaksi di-void", `${n(f.void_count)} · ${m(f.void_amount)}`, "dibatalkan manajer, beralasan"],
              ["Diskon diberikan", m(f.discount), f.discount_promo ? `termasuk promo online ${m(f.discount_promo)}` : "paket & promo"],
            ].map(([k, v, sub]) => <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-[13px] tabular">{v}</b><span className="text-[10px] text-muted">{sub}</span></div>)}
          </div>
          <p className="mt-1 text-[11px] text-muted">
            {fullPayroll ? "Biaya staf = gaji & komisi bulan penuh (termasuk subsidi gaji minimum & penyesuaian) + kasbon yang sudah dipotong dari gaji."
              : `Upah staf = estimasi komisi dari transaksi periode ini ${m(x.commission_est)} + jaring harian ${m(x.subsidy_est ?? 0)} + gaji pokok prorata ${m(x.base_salary_est ?? 0)}; jaring bulanan & penyesuaian diselesaikan akhir bulan.`}
            {" "}Laba/rugi operasional belum memperhitungkan pajak, penyusutan, bunga, dan biaya tetap yang tidak dicatat di aplikasi — bukan laba bersih.
            {!!f.payments.tips_qris && ` Tips non-tunai ${m(f.payments.tips_qris)} adalah titipan staf (masuk via QRIS/transfer, diserahkan tunai) — tidak dihitung di atas.`}
            {" "}Saldo deposit pelanggan {m(f.deposit.balance_end)} adalah kewajiban layanan yang belum dipakai.
          </p>
        </section>

        <section aria-labelledby="h-e">
          <H id="h-e">E. Orang & operasional</H>
          <div className="grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
            {[["Kepatuhan SOP", `${pc(r.operations.sop.compliance_pct)}`, `${r.operations.sop.ok}/${r.operations.sop.operational} hari diotorisasi`],
              ["Utilisasi kursi/bed", pc(s.utilization), `target ${t.utilization}%`],
              ["Perawatan fasilitas", `${r.operations.maintenance_done} selesai`, `${r.operations.maintenance_overdue_now} terlambat saat ini`],
              ["Stok menipis (saat ini)", n(r.operations.inventory.low_stock_now), "item perlu pengadaan"],
              ["Kehadiran staf", NA, "absensi belum dicatat"],
              ["Komplain & pengerjaan ulang", NA, "belum dicatat"],
            ].map(([k, v, sub]) => <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-[13px] tabular">{v}</b><span className="text-[10px] text-muted">{sub}</span></div>)}
          </div>
          <table className="mt-2 w-full border-collapse text-[11.5px]">
            <thead><tr>{["Staf", "Bidang", "Layanan dikerjakan", "Omzet jasa", "Utilisasi", "No-show"].map((h, i) => <th key={h} className={`${th} ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {staff.map((st) => (
                <tr key={st.staff_id}><td className={td}>{st.name}{st.active ? "" : " (nonaktif)"}</td><td className={td}>{CAT_NAME[st.category]}</td>
                  <td className={num}>{n(st.service_items)}</td><td className={num}>{m(st.service_revenue)}</td><td className={num}>{pc(st.utilization)}</td><td className={num}>{n(st.no_show)}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted">Urut menurut nama, bukan peringkat: omzet staf dipengaruhi jam kerja, durasi layanan, jumlah pelanggan yang datang, dan kualitas — belum seluruhnya tercatat.</p>
        </section>

        <section aria-labelledby="h-f">
          <H id="h-f">F. Pemasaran</H>
          <div className="grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
            {[["Kampanye WA terkirim", n(x.campaign_sends), `${n(x.campaign_recipients)} penerima`],
              ["Biaya pemasaran", m(marketing), "pengeluaran kategori Pemasaran"],
              ["Promo booking online", m(f.discount_promo ?? 0), "diskon yang diberikan"],
              ["Porsi booking online", pc(s.online_share), cov.enough ? `pelanggan baru ${n(s.new_customers)}` : "pelanggan baru: data belum cukup"],
            ].map(([k, v, sub]) => <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-[13px] tabular">{v}</b><span className="text-[10px] text-muted">{sub}</span></div>)}
          </div>
          <p className="mt-1 text-[11px] text-muted">Atribusi kampanye → booking/omzet: {NA.toLowerCase()} (booking belum ditandai sumber kampanye). Hasil kampanye tidak disimpulkan dari kenaikan omzet saja.</p>
        </section>

        <section aria-labelledby="h-g">
          <H id="h-g">G. Masalah utama & tindakan korektif</H>
          {N.issues?.length ? (
            <table className="w-full border-collapse text-[11px]">
              <thead><tr>{["Masalah", "Bukti/data", "Dampak", "Akar penyebab / hipotesis", "Tindakan", "PJ", "Tenggat"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{N.issues.map((i, k) => <tr key={k}>{[i.masalah, i.bukti, i.dampak, i.akar, i.tindakan, i.pj, i.tenggat].map((v, j) => <td key={j} className={td}>{v || "—"}</td>)}</tr>)}</tbody>
            </table>
          ) : <Empty />}
        </section>

        <section aria-labelledby="h-h">
          <H id="h-h">H. Keputusan yang dibutuhkan dari owner</H>
          {N.decisions?.length ? (
            <div className="flex flex-col gap-2">
              {N.decisions.map((d, k) => (
                <div key={k} className="keep rounded-[10px] border border-ink p-2.5 text-[12px]">
                  <b className="block text-[13px]">{k + 1}. {d.keputusan || "—"}</b>
                  {([["Alasan & bukti", d.alasan], ["Opsi", d.opsi], ["Rekomendasi manajer", d.rekomendasi], ["Estimasi biaya / dampak", d.biaya], ["Risiko bila ditunda", d.risiko], ["Tenggat keputusan", d.tenggat]] as const)
                    .map(([l, v]) => <span key={l} className="block"><span className="text-muted">{l}:</span> {v || "—"}</span>)}
                </div>
              ))}
            </div>
          ) : N.no_decision ? <p className="text-[12px]">Tidak ada keputusan owner yang mendesak.</p> : <Empty />}
        </section>

        <section aria-labelledby="h-i">
          <H id="h-i">I. Prioritas {weekly ? "minggu" : "bulan"} berikutnya</H>
          {N.priorities?.length ? (
            <table className="w-full border-collapse text-[11.5px]">
              <thead><tr>{["Tujuan", "Tindakan konkret", "Indikator keberhasilan", "PJ", "Tenggat"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{N.priorities.map((i, k) => <tr key={k}>{[i.tujuan, i.tindakan, i.indikator, i.pj, i.tenggat].map((v, j) => <td key={j} className={td}>{v || "—"}</td>)}</tr>)}</tbody>
            </table>
          ) : <Empty />}
        </section>

        {monthly && <>
          <section aria-labelledby="h-j">
            <H id="h-j">J. Pelanggan & retensi</H>
            <div className="grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
              {[["Pelanggan baru", n(r.customers.new_customers)], ["Pelanggan kembali", n(r.customers.returning)],
                [`Pelanggan baru yang kembali ≤ ${r.customers.window_days} hari`, `${pc(r.customers.return_rate)} (${r.customers.return_back}/${r.customers.return_eligible})`],
                ["Belum kembali (saat ini)", n(r.customers.churn_count)]].map(([k, v]) => [k, cov.enough ? v : "Data belum cukup"]).map(([k, v]) => (
                <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-[13px] tabular">{v}</b></div>
              ))}
            </div>
            {!cov.enough && <p className="mt-1 text-[11px] text-muted">Angka pelanggan belum ditampilkan: {coverageNote(cov.pct)}.</p>}
            {charts.mix.weekly.length > 1 && (
              <div className="keep mt-2">
                <b className="text-[12px]">Omzet per minggu</b>
                <p className="text-[11px] tabular">{charts.mix.mix.map((c) => `${CAT_LABEL[c.category]} ${formatRupiah(c.revenue)} (${pc(c.share)})`).join(" · ")}</p>
                <StackedWeekly weeks={charts.mix.weekly} />
              </div>
            )}
          </section>
          <section aria-labelledby="h-k">
            <H id="h-k">K. Stok & pengadaan</H>
            <div className="grid grid-cols-2 gap-2 text-[12px] min-[700px]:grid-cols-4 print:grid-cols-4">
              {[["Nilai stok akhir", m(r.operations.inventory.value_end)], ["Stok masuk / terpakai", `${m(r.operations.inventory.in_value)} / ${m(r.operations.inventory.out_value)}`],
                ["Stok menipis (saat ini)", n(r.operations.inventory.low_stock_now)],
                ["Selisih pemakaian bahan", r.operations.inventory.opnames >= 2 ? `${r.operations.inventory.usage_flagged} bahan · ${m(r.operations.inventory.usage_variance_value)}` : "butuh ≥ 2 opname"]].map(([k, v]) => (
                <div key={k} className="keep rounded-[10px] border border-line p-2"><span className="text-[11px] text-muted">{k}</span><b className="block text-[13px] tabular">{v}</b></div>
              ))}
            </div>
          </section>
          <section aria-labelledby="h-l">
            <H id="h-l">L. Evaluasi tindakan bulan sebelumnya</H>
            {N.evaluation?.trim() ? <p className="whitespace-pre-line">{N.evaluation}</p> : <Empty />}
          </section>
          <section aria-labelledby="h-m">
            <H id="h-m">M. Rencana & target bulan berikutnya</H>
            {N.next_plan?.trim() ? <p className="whitespace-pre-line">{N.next_plan}</p> : <Empty />}
          </section>
        </>}

        <footer className="border-t border-line pt-2 text-[10px] leading-relaxed text-muted">
          <b>Definisi.</b> Omzet bersih = harga setelah diskon, tanpa transaksi void. Margin kontribusi = omzet bersih − bahan/HPP − biaya staf.
          Laba/rugi operasional = margin kontribusi − pengeluaran operasional tercatat. Arus kas tercatat = uang masuk & keluar yang dicatat di aplikasi.
          <br /><b>Data belum tersedia:</b> komplain & pengerjaan ulang, kehadiran staf, atribusi kampanye ke booking, biaya tetap di luar aplikasi,
          batas nominal delegasi manajer (perlu disepakati dengan owner).
        </footer>
      </article>
    </div>
  );
}
