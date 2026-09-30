"use client";

import Link from "next/link";
import { useToast } from "@/components/ui";
import { downloadText, toCsv } from "@/lib/domain/csv";
import { formatJam, formatRupiah, formatTanggal } from "@/lib/domain/format";
import { formatUnitCost } from "@/lib/domain/inventory";
import { createClient } from "@/lib/supabase/client";
import { ADJUST_REASONS, MOVE_TYPE, qtyFmt, type StockRow } from "./types";

export type MoveRow = {
  id: string; created_at: string; item_id: string; qty: number; type: string; unit_cost: number | null; note: string; reason: string | null;
  transaction_id: string | null; opname_id: string | null; invoice_no: string | null; attachment_path: string | null; by: string;
};
const REASON = Object.fromEntries(ADJUST_REASONS);

export function MovesTab({ rows, items, people, filter }: { rows: MoveRow[]; items: StockRow[]; people: [string, string][]; filter: Record<string, string> }) {
  const toast = useToast();
  const it = (id: string) => items.find((i) => i.item_id === id);
  const desc = (m: MoveRow) => [m.reason ? REASON[m.reason] : "", m.note].filter(Boolean).join(" · ");
  async function openReceipt(path: string) {
    const { data, error } = await createClient().storage.from("receipts").createSignedUrl(path, 300);
    if (error) return toast(error.message, "error");
    window.open(data.signedUrl, "_blank", "noopener");
  }
  function exportCsv() {
    downloadText(`mutasi-stok-${new Date().toISOString().slice(0, 10)}.csv`, toCsv([
      ["Tanggal", "Jam", "Item", "Jenis", "Jumlah", "Satuan", "Harga beli/satuan", "Referensi", "Keterangan", "Oleh"],
      ...rows.map((m) => [formatTanggal(m.created_at), formatJam(m.created_at), it(m.item_id)?.name ?? "", MOVE_TYPE[m.type]?.label ?? m.type,
        String(m.qty).replace(".", ","), it(m.item_id)?.unit ?? "", m.unit_cost == null ? "" : String(m.unit_cost).replace(".", ","),
        m.transaction_id ? `Transaksi ${m.transaction_id.slice(0, 8)}` : m.opname_id ? "Opname" : m.invoice_no ? `Nota ${m.invoice_no}` : "",
        desc(m), m.by]),
    ]));
  }
  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-3.5">
        <input type="hidden" name="tab" value="mutasi" />
        <label className="flex flex-col"><span className="label">Item</span>
          <select name="item" defaultValue={filter.item ?? ""} className="input w-48"><option value="">Semua</option>{items.map((i) => <option key={i.item_id} value={i.item_id}>{i.name}</option>)}</select>
        </label>
        <label className="flex flex-col"><span className="label">Jenis</span>
          <select name="type" defaultValue={filter.type ?? ""} className="input w-40"><option value="">Semua</option>{Object.entries(MOVE_TYPE).map(([v, t]) => <option key={v} value={v}>{t.label}</option>)}</select>
        </label>
        <label className="flex flex-col"><span className="label">Dari</span><input type="date" name="from" defaultValue={filter.from ?? ""} className="input w-40" /></label>
        <label className="flex flex-col"><span className="label">Sampai</span><input type="date" name="to" defaultValue={filter.to ?? ""} className="input w-40" /></label>
        <label className="flex flex-col"><span className="label">Oleh</span>
          <select name="by" defaultValue={filter.by ?? ""} className="input w-40"><option value="">Semua</option>{people.map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </label>
        <button className="btn-ink h-11">Terapkan</button>
        <Link href="/manajer/inventaris?tab=mutasi" className="btn-ghost h-11">Reset</Link>
        <button type="button" onClick={exportCsv} disabled={!rows.length} className="btn-ghost ml-auto h-11">Ekspor CSV</button>
      </form>
      <div className="overflow-x-auto rounded-[14px] border border-line bg-card px-3">
        <table className="w-full min-w-[900px] text-sm tabular">
          <thead><tr className="text-left text-xs text-muted">{["Tanggal", "Item", "Jenis", "Jumlah", "Harga", "Referensi", "Keterangan", "Oleh"].map((h) => <th key={h} className={`py-2.5 pr-2 font-semibold ${h === "Jumlah" || h === "Harga" ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>
            {!rows.length && <tr><td colSpan={8} className="py-6 text-center text-muted">Tidak ada mutasi untuk filter ini.</td></tr>}
            {rows.map((m) => {
              const t = MOVE_TYPE[m.type];
              return (
                <tr key={m.id} className="border-t border-[#F0EDE6]">
                  <td className="whitespace-nowrap py-2 pr-2">{formatTanggal(m.created_at)} <span className="text-muted">{formatJam(m.created_at)}</span></td>
                  <td className="pr-2 font-semibold">{it(m.item_id)?.name ?? "—"}</td>
                  <td className="pr-2"><span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: t?.bg, color: t?.fg }}>{t?.label ?? m.type}</span></td>
                  <td className={`whitespace-nowrap pr-2 text-right font-bold ${m.qty < 0 ? "text-[#A12A2A]" : "text-[#1F7A45]"}`}>{m.qty > 0 ? "+" : "−"}{qtyFmt(Math.abs(m.qty))} {it(m.item_id)?.unit}</td>
                  <td className="whitespace-nowrap pr-2 text-right">{m.type === "in" && m.unit_cost != null ? formatUnitCost(m.unit_cost) : ""}</td>
                  <td className="pr-2">
                    {m.transaction_id ? <Link className="underline" href={`/manajer/kasir?tab=riwayat&tx=${m.transaction_id}`}>Transaksi</Link>
                      : m.opname_id ? <Link className="underline" href={`/manajer/inventaris/opname/${m.opname_id}`}>Opname</Link>
                      : m.attachment_path ? <button className="min-h-11 underline" onClick={() => openReceipt(m.attachment_path!)}>Nota {m.invoice_no ?? ""}</button>
                      : m.invoice_no ? `Nota ${m.invoice_no}` : "—"}
                  </td>
                  <td className="pr-2 text-muted">{desc(m) || "—"}</td>
                  <td className="pr-2">{m.by}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length >= 500 && <p className="text-xs text-muted">Menampilkan 500 mutasi terbaru — persempit filter untuk melihat lebih lama.</p>}
    </div>
  );
}

export type UsageRow = { item_id: string; name: string; unit: string; theoretical: number; actual: number; variance: number; variance_pct: number | null; variance_value: number; flagged: boolean };

export function UsageTab({ opnames, from, to, rows, threshold }: {
  opnames: { id: string; label: string }[]; from: string; to: string; rows: UsageRow[] | null; threshold: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      {opnames.length < 2 ? (
        <p className="rounded-[14px] border border-dashed border-line bg-card p-6 text-center text-muted">Butuh minimal dua opname Bahan HPP yang disetujui. Lakukan opname bulanan, lalu kembali ke sini.</p>
      ) : (
        <form className="flex flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-3.5">
          <input type="hidden" name="tab" value="laporan" />
          <label className="flex flex-col"><span className="label">Opname awal</span>
            <select name="dari" defaultValue={from} className="input w-60">{opnames.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <label className="flex flex-col"><span className="label">Opname akhir</span>
            <select name="sampai" defaultValue={to} className="input w-60">{opnames.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}</select>
          </label>
          <button className="btn-ink h-11">Tampilkan</button>
        </form>
      )}
      {rows && (
        <div className="overflow-x-auto rounded-[14px] border border-line bg-card px-3">
          <table className="w-full min-w-[760px] text-sm tabular">
            <thead><tr className="text-left text-xs text-muted">{["Bahan", "Teoretis", "Aktual", "Selisih", "Selisih %", "Nilai selisih"].map((h, i) => <th key={h} className={`py-2.5 pr-2 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id} className={`border-t border-[#F0EDE6] ${r.flagged ? "bg-[#FFF4F4]" : ""}`}>
                  <td className="py-2 pr-2 font-semibold">{r.name}{r.flagged && <span className="ml-2 rounded-full bg-[#FFDADA] px-2 text-[11px] font-bold text-[#6E1616]">Di atas {threshold}%</span>}</td>
                  <td className="pr-2 text-right">{qtyFmt(r.theoretical)} {r.unit}</td>
                  <td className="pr-2 text-right">{qtyFmt(r.actual)} {r.unit}</td>
                  <td className="pr-2 text-right font-bold">{r.variance > 0 ? "+" : ""}{qtyFmt(r.variance)}</td>
                  <td className="pr-2 text-right">{r.variance_pct == null ? "—" : `${r.variance_pct > 0 ? "+" : ""}${Number(r.variance_pct).toLocaleString("id-ID")}%`}</td>
                  <td className="pr-2 text-right">{r.variance_value < 0 ? "−" : ""}{formatRupiah(Math.abs(r.variance_value))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted">Teoretis = layanan terjual × resep saat transaksi. Aktual = stok awal + masuk + penyesuaian − stok akhir − terjual.
        Selisih besar bisa berarti pemborosan, bahan tercecer, atau resep kurang akurat.</p>
    </div>
  );
}
