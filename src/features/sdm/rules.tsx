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

type StaffRule = { id: string; name: string; category: Cat; commission_pct_override: number | null; daily_min_pay: number | null; active: boolean;
  deduct_hpp: boolean | null; retail_pct_override: number | null; base_salary: number | null; pay_monthly: boolean };
type Row = { pct: string; hpp: "" | "true" | "false"; retail: string; base: string; monthly: boolean; daily: string };

const rp = (n: number | null) => (n ? n.toLocaleString("id-ID") : "");
const digits = (v: string) => Number(v.replace(/\D/g, "")) || null;
const intOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
const toRow = (s: StaffRule): Row => ({ pct: s.commission_pct_override == null ? "" : String(s.commission_pct_override), hpp: s.deduct_hpp == null ? "" : s.deduct_hpp ? "true" : "false",
  retail: s.retail_pct_override == null ? "" : String(s.retail_pct_override), base: rp(s.base_salary), monthly: s.pay_monthly, daily: rp(s.daily_min_pay) });

/**
 * Satu-satunya tempat aturan upah (1 Nov 2026): aturan umum + aturan per staf (komisi khusus, potong HPP, ritel, gaji pokok,
 * bayar bulanan, jaring harian). Pengaturan → Staf hanya data identitas & operasional.
 */
export function CommissionRules({ ratio, retailPct, basis, deductHpp, staff }: { ratio: number; retailPct: number; basis: "net" | "gross"; deductHpp: boolean; staff: StaffRule[] }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [f, setF] = useState({ ratio, retail: String(retailPct), basis, hpp: deductHpp });
  const [rows, setRows] = useState<Record<string, Row>>(Object.fromEntries(staff.map((s) => [s.id, toRow(s)])));
  const set = (id: string, patch: Partial<Row>) => setRows({ ...rows, [id]: { ...rows[id], ...patch } });
  async function save() {
    const supabase = createClient();
    const retail = Number(f.retail.replace(",", "."));
    if (!(retail >= 0 && retail <= 100)) return toast("Cek angka komisi ritel", "error");
    const changes: [StaffRule, Omit<StaffRule, "id" | "name" | "category" | "active">][] = [];
    for (const s of staff) {
      const r = rows[s.id];
      const v = { commission_pct_override: intOrNull(r.pct), deduct_hpp: r.hpp === "" ? null : r.hpp === "true", retail_pct_override: intOrNull(r.retail),
        base_salary: digits(r.base), pay_monthly: r.monthly, daily_min_pay: digits(r.daily) };
      for (const [k, n] of [["komisi khusus", v.commission_pct_override], ["komisi ritel", v.retail_pct_override]] as const)
        if (n !== null && !(Number.isInteger(n) && n >= 0 && n <= 100)) return toast(`${s.name}: ${k} harus 0–100`, "error");
      if ((Object.keys(v) as (keyof typeof v)[]).some((k) => v[k] !== s[k])) changes.push([s, v]);
    }
    const { error } = await supabase.from("settings").update({ commission_pct: f.ratio, retail_commission_pct: retail, commission_basis: f.basis, commission_deduct_hpp: f.hpp }).eq("id", true);
    if (error) return toast(error.message, "error");
    for (const [s, v] of changes) {
      const r = await supabase.from("staff").update(v).eq("id", s.id);
      if (r.error) return toast(`${s.name}: ${r.error.message}`, "error");
    }
    toast("Aturan upah disimpan"); router.refresh();
  }
  const ex = itemCommission(162000, f.hpp ? 12000 : 0, f.ratio);
  const harga = f.basis === "gross" ? "harga normal" : "harga bersih";
  /** Ringkasan skema satu staf dari isian saat ini (kosong = ikut aturan umum). */
  const scheme = (r: Row) => {
    const pct = r.pct.trim() === "" ? f.ratio : Number(r.pct), hpp = r.hpp === "" ? f.hpp : r.hpp === "true";
    const ret = r.retail.trim() === "" ? Number(f.retail) || 0 : Number(r.retail), base = digits(r.base), daily = digits(r.daily);
    return [`${pct}% ${harga}${hpp ? " − HPP" : ""}`, ret > 0 && `ritel ${ret}%`, base && `gaji pokok ${formatRupiah(base)}/bulan`,
      daily && `jaring harian ${formatRupiah(daily)}`, r.monthly ? "dibayar bulanan" : "dibayar mingguan"].filter(Boolean).join(" · ");
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="flex flex-col gap-4">
      <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-card p-5">
        <b>Aturan umum</b>
        <div className="flex flex-col gap-2">
          <label htmlFor="cr-ratio" className="label">Rasio komisi umum: <b className="text-lg text-ink">{f.ratio}%</b> dari {harga}{f.hpp && " − HPP"}</label>
          <input id="cr-ratio" type="range" min={20} max={60} step={5} value={f.ratio} onChange={(e) => setF({ ...f, ratio: Number(e.target.value) })} className="h-11 accent-accent" />
          <div className="flex justify-between text-xs text-muted tabular"><span>20%</span><span>40%</span><span>60%</span></div>
        </div>
        <fieldset className="flex flex-col gap-1.5">
          <legend className="label mb-1">Komisi dihitung dari</legend>
          <div role="radiogroup" aria-label="Dasar komisi" className="grid gap-2 min-[560px]:grid-cols-2">
            {([["net", "Harga setelah diskon", "Promo & diskon paket ikut mengurangi komisi"], ["gross", "Harga normal", "Diskon & promo ditanggung toko — komisi staf utuh"]] as const).map(([v, l, d]) => (
              <button type="button" key={v} role="radio" aria-checked={f.basis === v} onClick={() => setF({ ...f, basis: v })}
                className={`flex min-h-14 flex-col items-start justify-center rounded-[10px] border-2 px-3 text-left ${f.basis === v ? "border-ink bg-paper" : "border-line bg-card"}`}>
                <b className="text-sm">{l}</b><span className="text-xs text-muted">{d}</span>
              </button>
            ))}
          </div>
          <span className="text-xs text-muted">Berlaku untuk transaksi setelah disimpan; komisi transaksi sebelumnya tidak berubah.</span>
        </fieldset>
        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" className="size-5 accent-accent" checked={f.hpp} onChange={(e) => setF({ ...f, hpp: e.target.checked })} />
          <span><b>Potong HPP bahan habis pakai dari komisi</b><span className="block text-xs text-muted">Berlaku juga untuk transaksi lama di periode yang belum ditutup.</span></span>
        </label>
        <div className="grid grid-cols-2 gap-3">
          <Field label={`Komisi ritel (% ${harga})`} htmlFor="cr-retail"><input id="cr-retail" inputMode="decimal" className="input" value={f.retail} onChange={(e) => setF({ ...f, retail: e.target.value })} /></Field>
        </div>
        <div className="rounded-[12px] bg-paper p-3.5 text-sm leading-relaxed">
          <b>Cara hitung umum:</b> tiap layanan, staf mendapat <b>{f.ratio}%</b> dari {f.basis === "gross" ? "harga normal (sebelum diskon & promo)" : "harga bersih setelah diskon"} {f.hpp ? "dikurangi HPP bahan (tidak pernah minus)" : "(HPP bahan tidak dipotong)"}.
          {Number(f.retail) > 0 && <> Produk ritel yang ia jual menambah <b>{f.retail}%</b>.</>}
          {" "}Bonus/potongan manual ditambahkan setelah komisi. Contoh: Gel Polish net Rp162.000{f.hpp && ", HPP Rp12.000"} → komisi <b>{formatRupiah(ex)}</b>.
          Staf dengan aturan khusus di bawah mengikuti skemanya sendiri.
        </div>
      </section>
      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-5">
        <b>Aturan per staf</b>
        <span className="text-xs text-muted">Kosong = ikut aturan umum. Jaring harian: di hari staf melayani ≥1 layanan dan komisinya di bawah angka ini, toko menutup
          selisihnya (dibayar bersama komisi mingguan). Bayar bulanan: komisi tidak dibayar mingguan, tetapi bersama gaji akhir bulan.</span>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead><tr className="text-left text-xs text-muted">
              <th className="py-2 pr-2 font-semibold">Staf</th><th className="py-2 pr-2 font-semibold">Komisi khusus (%)</th><th className="py-2 pr-2 font-semibold">Potong HPP</th>
              <th className="py-2 pr-2 font-semibold">Komisi ritel (%)</th><th className="py-2 pr-2 font-semibold">Gaji pokok / bulan (Rp)</th>
              <th className="py-2 pr-2 font-semibold">Bayar bulanan</th><th className="py-2 font-semibold">Jaring harian (Rp)</th>
            </tr></thead>
            <tbody>
              {staff.map((s) => { const r = rows[s.id]; return (
                <tr key={s.id} className="border-t border-[#EEEEEA] align-top">
                  <td className="py-2 pr-2">
                    <span className="flex items-center gap-2"><span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: CAT[s.category].color }} />
                      <b>{s.name}</b>{!s.active && <span className="rounded-full bg-[#EFEFEB] px-2 py-0.5 text-[11px] font-bold text-[#4A4C46]">nonaktif</span>}</span>
                    <span className="mt-1 block max-w-[260px] text-xs text-muted">{scheme(r)}</span>
                  </td>
                  <td className="py-2 pr-2"><input aria-label={`Komisi khusus ${s.name}`} inputMode="numeric" placeholder={`${f.ratio}`} className="input w-20" value={r.pct} onChange={(e) => set(s.id, { pct: e.target.value })} /></td>
                  <td className="py-2 pr-2"><select aria-label={`Potong HPP ${s.name}`} className="input w-36" value={r.hpp} onChange={(e) => set(s.id, { hpp: e.target.value as Row["hpp"] })}>
                    <option value="">Ikut umum ({f.hpp ? "ya" : "tidak"})</option><option value="true">Ya</option><option value="false">Tidak</option></select></td>
                  <td className="py-2 pr-2"><input aria-label={`Komisi ritel ${s.name}`} inputMode="numeric" placeholder={f.retail || "0"} className="input w-20" value={r.retail} onChange={(e) => set(s.id, { retail: e.target.value })} /></td>
                  <td className="py-2 pr-2"><input aria-label={`Gaji pokok ${s.name}`} inputMode="numeric" placeholder="—" className="input w-36" value={r.base}
                    onChange={(e) => set(s.id, { base: rp(digits(e.target.value)) })} /></td>
                  <td className="py-2 pr-2"><input type="checkbox" aria-label={`Bayar bulanan ${s.name}`} className="mt-3 size-5 accent-accent" checked={r.monthly} onChange={(e) => set(s.id, { monthly: e.target.checked })} /></td>
                  <td className="py-2"><input aria-label={`Jaring harian ${s.name}`} inputMode="numeric" placeholder="—" className="input w-32" value={r.daily}
                    onChange={(e) => set(s.id, { daily: rp(digits(e.target.value)) })} /></td>
                </tr>
              ); })}
            </tbody>
          </table>
        </div>
        <button disabled={!online} className="btn-ink mt-2 h-12 self-start px-6">Simpan aturan upah</button>
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
