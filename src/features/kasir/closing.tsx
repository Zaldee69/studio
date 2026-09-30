"use client";

import { useState } from "react";
import { Empty, Field, useOnline, useToast } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import type { Master } from "../counter/types";

type Summary = {
  tx_count: number; gross_total: number; discount_total: number; cash_sales: number; qris_sales: number; deposit_used: number;
  topup_cash: number; topup_qris: number; topup_credited: number; topup_count: number; expected_cash: number;
  voided: { id: string; created_at: string; total: number; reason: string }[];
};

/** Tutup kasir harian: rekap dari server (cash_summary), input kas fisik → selisih, simpan & cetak. */
export function Closing({ master }: { master: Master }) {
  const toast = useToast();
  const online = useOnline();
  const [date, setDate] = useState(jktDate());
  const [physical, setPhysical] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const { data: s, refresh } = useRealtimeTable(["transactions", "deposit_topups"], async () => {
    const { data, error } = await createClient().rpc("cash_summary", { p_date: date });
    if (error) throw error;
    return data as unknown as Summary;
  }, date);
  const { data: closings } = useRealtimeTable(["cash_closings"], async () => {
    const { data } = await createClient().from("cash_closings").select("id, created_at, expected_cash, physical_cash, difference, note")
      .eq("date", date).order("created_at", { ascending: false });
    return data ?? [];
  }, date);

  const phys = physical === "" ? null : Number(physical);
  const diff = s && phys != null ? phys - s.expected_cash : null;

  async function save() {
    if (phys == null) return;
    setSaving(true);
    const { error } = await createClient().rpc("save_cash_closing", { p_date: date, p_physical_cash: phys, p_note: note });
    setSaving(false);
    if (error) return toast(error.message, "error");
    toast("Tutup kasir tersimpan");
    setPhysical(""); setNote(""); refresh();
  }

  const row = (k: string, v: number | string, strong = false) => (
    <div className={`flex justify-between gap-3 py-1.5 tabular ${strong ? "text-base font-bold" : "text-sm"}`}><span>{k}</span><span>{typeof v === "number" ? formatRupiah(v) : v}</span></div>
  );

  return (
    <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto min-[1000px]:grid-cols-[1fr_380px]">
      <section className="print-area flex flex-col gap-4 rounded-[14px] border border-line bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1">
            <h2 className="font-display text-xl font-bold">Rekap kasir</h2>
            <span className="text-[13px] text-muted">{master.shop.name} · {formatTanggal(`${date}T12:00:00+07:00`)}</span>
          </div>
          <div className="no-print"><Field label="Tanggal" htmlFor="cl-date">
            <input id="cl-date" type="date" className="input" value={date} max={jktDate()} onChange={(e) => e.target.value && setDate(e.target.value)} />
          </Field></div>
        </div>
        {!s ? <Empty>Memuat…</Empty> : (
          <>
            <div className="divide-y divide-[#F0EDE6]">
              {row("Jumlah transaksi", String(s.tx_count))}
              {row("Omzet (setelah diskon)", s.gross_total)}
              {row("Total diskon", s.discount_total)}
              {row("Penjualan Tunai", s.cash_sales)}
              {row("Penjualan QRIS", s.qris_sales)}
              {row("Deposit terpakai", s.deposit_used)}
              {row(`Top-up deposit Tunai (${s.topup_count}×)`, s.topup_cash)}
              {row("Top-up deposit QRIS", s.topup_qris)}
              {row("Saldo deposit masuk (termasuk bonus)", s.topup_credited)}
            </div>
            <div className="rounded-[10px] bg-paper px-3 py-2">{row("Kas diharapkan (tunai jual + tunai top-up)", s.expected_cash, true)}</div>
            <div>
              <span className="text-xs font-bold uppercase tracking-[0.06em] text-muted">Transaksi void</span>
              {!s.voided.length ? <p className="py-1.5 text-sm text-muted">Tidak ada.</p> : s.voided.map((v) => (
                <div key={v.id} className="flex justify-between gap-3 py-1.5 text-sm tabular"><span>{formatJam(v.created_at)} · {v.reason}</span><span>{formatRupiah(v.total)}</span></div>
              ))}
            </div>
            {closings?.[0] && (
              <div className="rounded-[10px] border border-line p-3 text-sm">
                <b>Penutupan terakhir {formatJam(closings[0].created_at)}</b>
                {row("Kas fisik", closings[0].physical_cash)}
                {row("Selisih", closings[0].difference ?? 0, true)}
                {closings[0].note && <p className="text-muted">{closings[0].note}</p>}
              </div>
            )}
          </>
        )}
      </section>

      <section className="no-print flex flex-col gap-3 self-start rounded-[14px] border border-line bg-card p-5">
        <h2 className="font-display text-xl font-bold">Hitung kas fisik</h2>
        <Field label="Kas fisik di laci (Rp)" htmlFor="cl-phys">
          <input id="cl-phys" inputMode="numeric" className="input text-right text-lg tabular"
            value={physical ? Number(physical).toLocaleString("id-ID") : ""} onChange={(e) => setPhysical(e.target.value.replace(/\D/g, ""))} />
        </Field>
        {diff != null && (
          <div className={`rounded-[10px] px-3 py-2.5 text-[15px] font-bold tabular ${diff === 0 ? "bg-[#D9F2E1] text-[#144D2A]" : "bg-[#FFDADA] text-[#6E1616]"}`}>
            Selisih {diff > 0 ? "+" : ""}{formatRupiah(diff)} {diff === 0 ? "· pas" : diff > 0 ? "· lebih" : "· kurang"}
          </div>
        )}
        <Field label="Catatan (opsional)" htmlFor="cl-note">
          <textarea id="cl-note" rows={2} className="input py-2.5" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <button onClick={save} disabled={phys == null || saving || !online} className="btn-ink h-12">{saving ? "Menyimpan…" : "Simpan tutup kasir"}</button>
        <button onClick={() => window.print()} className="btn-ghost h-11 rounded-[10px]">Cetak / simpan PDF</button>
        {!!closings?.length && <p className="text-xs text-muted">{closings.length}× ditutup pada tanggal ini.</p>}
      </section>
    </div>
  );
}
