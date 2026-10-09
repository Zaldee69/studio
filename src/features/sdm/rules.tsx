"use client";

import type { Cat } from "@/lib/domain/category";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Field, useOnline, useToast } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { formatRupiah } from "@/lib/domain/format";
import { itemCommission } from "@/lib/domain/commission";
import { createClient } from "@/lib/supabase/client";
import { CAT } from "./shared";

type StaffRule = { id: string; name: string; category: Cat; commission_pct_override: number | null; active: boolean };

/** Aturan komisi: rasio global, override per staf, komisi ritel, ambang gaji minimum. Berlaku untuk periode yang belum ditutup. */
export function CommissionRules({ ratio, retailPct, minPay, staff }: { ratio: number; retailPct: number; minPay: number; staff: StaffRule[] }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [f, setF] = useState({ ratio, retail: String(retailPct), minPay: String(minPay) });
  const [ov, setOv] = useState<Record<string, string>>(Object.fromEntries(staff.map((s) => [s.id, s.commission_pct_override == null ? "" : String(s.commission_pct_override)])));
  async function save() {
    const supabase = createClient();
    const retail = Number(f.retail.replace(",", ".")), min = Number(f.minPay.replace(/\D/g, ""));
    if (!(retail >= 0 && retail <= 100) || !(min >= 0)) return toast("Cek angka komisi ritel & gaji minimum", "error");
    const { error } = await supabase.from("settings").update({ commission_pct: f.ratio, retail_commission_pct: retail, min_monthly_pay: min }).eq("id", true);
    if (error) return toast(error.message, "error");
    for (const s of staff) {
      const v = ov[s.id].trim() === "" ? null : Number(ov[s.id]);
      if (v !== s.commission_pct_override) {
        if (v !== null && !(Number.isInteger(v) && v >= 0 && v <= 100)) return toast(`Override ${s.name} harus 0–100`, "error");
        const r = await supabase.from("staff").update({ commission_pct_override: v }).eq("id", s.id);
        if (r.error) return toast(r.error.message, "error");
      }
    }
    toast("Aturan komisi disimpan"); router.refresh();
  }
  const ex = itemCommission(162000, 12000, f.ratio);
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="grid gap-4 min-[1000px]:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card p-5">
        <div className="flex flex-col gap-2">
          <label htmlFor="cr-ratio" className="label">Rasio komisi global: <b className="text-lg text-ink">{f.ratio}%</b> dari margin (harga bersih − HPP)</label>
          <input id="cr-ratio" type="range" min={20} max={60} step={5} value={f.ratio} onChange={(e) => setF({ ...f, ratio: Number(e.target.value) })} className="h-11 accent-accent" />
          <div className="flex justify-between text-xs text-muted tabular"><span>20%</span><span>40%</span><span>60%</span></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Komisi ritel (% harga bersih)" htmlFor="cr-retail"><input id="cr-retail" inputMode="decimal" className="input" value={f.retail} onChange={(e) => setF({ ...f, retail: e.target.value })} /></Field>
          <Field label="Jaring pengaman / bulan (Rp)" htmlFor="cr-min"><input id="cr-min" inputMode="numeric" className="input" value={f.minPay} onChange={(e) => setF({ ...f, minPay: e.target.value })} /></Field>
        </div>
        <div className="rounded-[12px] bg-paper p-3.5 text-sm leading-relaxed">
          <b>Cara hitung:</b> tiap layanan, staf mendapat <b>{f.ratio}%</b> dari harga bersih setelah diskon dikurangi HPP bahan (tidak pernah minus).
          {Number(f.retail) > 0 && <> Produk ritel yang ia jual menambah <b>{f.retail}%</b> dari harga bersih.</>}
          {" "}Jika total komisi sebulan di bawah <b>{formatRupiah(Number(f.minPay.replace(/\D/g, "")) || 0)}</b>, toko menambah selisihnya (subsidi).
          Bonus/potongan manual ditambahkan setelah subsidi. Contoh: Gel Polish net Rp162.000, HPP Rp12.000 → komisi <b>{formatRupiah(ex)}</b>.
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-5">
        <b>Rasio khusus per staf</b>
        <span className="text-xs text-muted">Kosongkan untuk memakai rasio global.</span>
        {staff.filter((s) => s.active).map((s) => (
          <div key={s.id} className="flex items-center gap-3 border-t border-[#EEEEEA] py-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: CAT[s.category].color }} />
            <label htmlFor={`ov-${s.id}`} className="flex-1 text-sm font-semibold">{s.name}</label>
            <input id={`ov-${s.id}`} inputMode="numeric" placeholder={`${f.ratio}`} className="input w-24" value={ov[s.id]} onChange={(e) => setOv({ ...ov, [s.id]: e.target.value })} />
            <span className="text-sm text-muted">%</span>
          </div>
        ))}
        <button disabled={!online} className="btn-ink mt-2 h-12">Simpan aturan komisi</button>
      </section>
    </form>
  );
}

export type LeaderRow = { rank: number; staff_id: string; staff_name: string; category: Cat; revenue_net: number; service_count: number; avg_per_service: number };

/** Papan peringkat: satu sumbu, warna mengikuti bidang (bukan peringkat), label langsung + tabel. */
export function Leaderboard({ rows }: { rows: LeaderRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.revenue_net));
  return (
    <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-5">
      <div className="flex flex-wrap gap-4 text-xs font-semibold">
        {Object.values(CAT).map((c) => <span key={c.label} className="flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-sm" style={{ background: c.color }} />{c.label}</span>)}
      </div>
      <ol className="flex flex-col gap-2" aria-label="Peringkat pendapatan jasa bersih">
        {rows.map((r) => (
          <li key={r.staff_id} className="grid grid-cols-[28px_110px_1fr] items-center gap-2 text-sm min-[820px]:grid-cols-[28px_140px_1fr_220px]"
            title={`${r.staff_name}: ${formatRupiah(r.revenue_net)} · ${r.service_count} layanan · rata-rata ${formatRupiah(r.avg_per_service)}`}>
            <b className="tabular">#{r.rank}</b>
            <span className="truncate font-semibold">{r.staff_name}</span>
            <span className="flex items-center gap-2">
              <span className="h-7 rounded-md" style={{ width: `${Math.max(1, (r.revenue_net / max) * 100)}%`, background: CAT[r.category].color }} />
              <b className="whitespace-nowrap text-xs tabular min-[820px]:hidden">{formatRupiah(r.revenue_net)}</b>
            </span>
            <span className="hidden text-right text-xs text-muted tabular min-[820px]:block"><b className="text-sm text-ink">{formatRupiah(r.revenue_net)}</b> · {r.service_count} layanan · ⌀ {formatRupiah(r.avg_per_service)}</span>
          </li>
        ))}
      </ol>
      <details>
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-accent">Lihat tabel</summary>
        <table className="w-full text-sm tabular">
          <thead><tr className="text-left text-xs text-muted">{["#", "Staf", "Pendapatan", "Layanan", "Rata-rata"].map((h, i) => <th key={h} className={`py-2 font-semibold ${i > 1 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.staff_id} className="border-t border-[#EEEEEA]"><td className="py-1.5">{r.rank}</td><td>{r.staff_name} <span className="text-muted">({CAT[r.category].label})</span></td>
              <td className="text-right">{formatRupiah(r.revenue_net)}</td><td className="text-right">{r.service_count}</td><td className="text-right">{formatRupiah(r.avg_per_service)}</td></tr>
          ))}</tbody>
        </table>
      </details>
    </div>
  );
}

export type ReviewRow = {
  staff_id: string; staff_name: string; category: Cat; revenue_net: number; service_count: number; avg_per_service: number;
  upsell_rate: number; return_rate: number; work_days: number; off_days: number; total_paid: number; note: string;
};

export function AnnualReview({ year, rows }: { year: number; rows: ReviewRow[] }) {
  const toast = useToast(); const online = useOnline();
  const [notes, setNotes] = useState<Record<string, string>>(Object.fromEntries(rows.map((r) => [r.staff_id, r.note])));
  async function saveNote(id: string) {
    const { error } = await createClient().from("staff_review_notes").upsert({ staff_id: id, year, note: notes[id], updated_at: new Date().toISOString() });
    if (error) return toast(error.message, "error");
    toast("Catatan disimpan");
  }
  const head = ["Staf", "Pendapatan jasa", "Layanan", "Rata-rata", "Upsell", "Pelanggan kembali ≤60 hr", "Hari kerja", "Hari izin", "Total dibayar", "Catatan manajer"];
  function exportCsv() {
    downloadText(`evaluasi-${year}.csv`, toCsv([head, ...rows.map((r) => [r.staff_name, r.revenue_net, r.service_count, r.avg_per_service,
      `${r.upsell_rate}%`, `${r.return_rate}%`, r.work_days, r.off_days, r.total_paid, notes[r.staff_id] ?? ""])]));
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted">Dasar keputusan bonus tahunan {year}. Total dibayar dari periode gaji yang sudah ditutup.</span>
        <button onClick={exportCsv} className="btn-ghost ml-auto h-11">Ekspor</button>
      </div>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-card px-3">
        <table className="w-full min-w-[1200px] text-sm tabular">
          <thead><tr className="text-left text-xs text-muted">{head.map((h, i) => <th key={h} className={`py-2.5 pr-2 font-semibold ${i && i < 9 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.staff_id} className="border-t border-[#EEEEEA] align-top">
                <td className="py-2 pr-2"><b>{r.staff_name}</b><span className="block text-xs text-muted">{CAT[r.category].label}</span></td>
                <td className="pr-2 text-right">{formatRupiah(r.revenue_net)}</td><td className="pr-2 text-right">{r.service_count}</td>
                <td className="pr-2 text-right">{formatRupiah(r.avg_per_service)}</td>
                <td className="pr-2 text-right">{Number(r.upsell_rate).toLocaleString("id-ID")}%</td><td className="pr-2 text-right">{Number(r.return_rate).toLocaleString("id-ID")}%</td>
                <td className="pr-2 text-right">{r.work_days}</td><td className="pr-2 text-right">{r.off_days}</td>
                <td className="pr-2 text-right">{formatRupiah(r.total_paid)}</td>
                <td className="py-1.5">
                  <div className="flex gap-1.5">
                    <label className="sr-only" htmlFor={`rn-${r.staff_id}`}>Catatan untuk {r.staff_name}</label>
                    <textarea id={`rn-${r.staff_id}`} rows={2} className="input min-w-56 py-2" value={notes[r.staff_id] ?? ""} onChange={(e) => setNotes({ ...notes, [r.staff_id]: e.target.value })} />
                    <button type="button" disabled={!online || (notes[r.staff_id] ?? "") === r.note} onClick={() => saveNote(r.staff_id)} className="btn-ghost h-11">Simpan</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
