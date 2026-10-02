"use client";

import { useEffect, useState } from "react";
import { CloseButton, Empty, Sheet, useOnline, useToast } from "@/components/ui";
import { dailySummary, METHOD_LABEL } from "@/lib/domain/closing";
import { formatJam, formatRupiah, formatTanggal, jktDate } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { TX_SELECT, useDayTransactions } from "../counter/hooks";
import type { Master, TxRow } from "../counter/types";
import { ReceiptView, toReceipt } from "./receipt-view";

/** Transaksi hari ini: klik → struk & kirim ulang. Void hanya manajer (dijaga juga di server). */
export function History({ master, txParam }: { master: Master; txParam: string | null }) {
  const toast = useToast();
  const online = useOnline();
  const today = jktDate();
  const { data, refresh } = useDayTransactions(today);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [openId, setOpenId] = useState<string | null>(txParam);
  const [extra, setExtra] = useState<TxRow | null>(null); // transaksi dari tanggal lain (tautan dari Jadwal)
  const [voiding, setVoiding] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    createClient().from("team_names").select("id, full_name")
      .then(({ data }) => setNames(new Map((data ?? []).map((r) => [r.id!, r.full_name!]))));
  }, []);
  const txs = data ?? [];
  const open = txs.find((t) => t.id === openId) ?? (extra?.id === openId ? extra : null);
  useEffect(() => {
    if (!openId || !data || data.some((t) => t.id === openId)) return;
    let alive = true;
    createClient().from("transactions").select(TX_SELECT).eq("id", openId).maybeSingle()
      .then(({ data: t }) => { if (alive) setExtra(t as unknown as TxRow | null); });
    return () => { alive = false; };
  }, [openId, data]);

  const sum = dailySummary(txs, []);

  async function doVoid() {
    const { error } = await createClient().rpc("void_transaction", { p_id: openId!, p_reason: reason });
    if (error) return toast(error.message, "error");
    toast("Transaksi dibatalkan · stok & booking dikembalikan");
    setVoiding(false); setReason(""); refresh();
    if (extra) setExtra({ ...extra, voided_at: new Date().toISOString(), void_reason: reason });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-[13px] text-muted tabular">
        <span><b className="text-ink">{sum.txCount}</b> transaksi</span>
        <span>Omzet <b className="text-ink">{formatRupiah(sum.grossTotal)}</b></span>
        <span>Tunai <b className="text-ink">{formatRupiah(sum.cashSales)}</b></span>
        <span>QRIS <b className="text-ink">{formatRupiah(sum.qrisSales)}</b></span>
        <span>Deposit <b className="text-ink">{formatRupiah(sum.depositUsed)}</b></span>
        {sum.voidedCount > 0 && <span className="text-[#A12A2A]">{sum.voidedCount} void</span>}
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-[14px] border border-line bg-card">
        <div className="grid grid-cols-[64px_1.4fr_1fr_1fr] gap-3 border-b border-line px-4 py-3 text-xs font-bold text-muted min-[1000px]:grid-cols-[64px_1.6fr_1fr_1.1fr_1fr]">
          <span>Jam</span><span>Pelanggan</span><span className="text-right">Total</span><span>Metode</span><span className="hidden min-[1000px]:block">Kasir</span>
        </div>
        <div className="max-h-full overflow-y-auto">
          {data === null ? <Empty>Memuat…</Empty> : !txs.length ? <Empty>Belum ada transaksi hari ini.</Empty> : txs.map((t) => (
            <button key={t.id} onClick={() => setOpenId(t.id)}
              className={`grid min-h-[52px] w-full grid-cols-[64px_1.4fr_1fr_1fr] items-center gap-3 border-b border-[#F0EDE6] px-4 py-2 text-left text-sm tabular hover:bg-paper min-[1000px]:grid-cols-[64px_1.6fr_1fr_1.1fr_1fr] ${t.voided_at ? "text-muted line-through" : ""}`}>
              <b>{formatJam(t.created_at)}</b>
              <span className="truncate">{t.customer?.name ?? "Pelanggan umum"}</span>
              <span className="text-right font-semibold">{formatRupiah(t.total)}</span>
              <span>{t.voided_at ? "Void" : METHOD_LABEL[t.payment_method]}</span>
              <span className="hidden truncate text-muted min-[1000px]:block">{names.get(t.cashier_id ?? "") ?? "—"}</span>
            </button>
          ))}
        </div>
      </div>

      <Sheet open={!!open} onClose={() => { setOpenId(null); setVoiding(false); }} label="Struk transaksi" width={460}>
        {open && (
          <div className="flex flex-col gap-4 p-6">
            <div className="no-print flex justify-end"><CloseButton onClick={() => setOpenId(null)} /></div>
            <ReceiptView r={toReceipt(open, master.shop, (id) => master.staff.find((s) => s.id === id)?.name, null)} title={`Transaksi ${formatTanggal(open.created_at)}`}>
              {master.role === "manager" && !open.voided_at && (voiding ? (
                <form onSubmit={(e) => { e.preventDefault(); doVoid(); }} className="flex flex-col gap-2 rounded-[10px] border border-[#EFA3A3] p-3">
                  <label htmlFor="void-reason" className="text-xs font-bold text-[#6E1616]">Alasan pembatalan (wajib)</label>
                  <input id="void-reason" className="input" autoFocus required value={reason} onChange={(e) => setReason(e.target.value)} />
                  <p className="text-xs text-muted">Booking kembali ke &quot;Selesai/Belum Bayar&quot;, stok & saldo deposit dikembalikan.</p>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setVoiding(false)} className="btn-ghost flex-1 rounded-[10px]">Kembali</button>
                    <button disabled={!reason.trim() || !online} className="btn flex-1 rounded-[10px] bg-[#A12A2A] text-white">Void transaksi</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setVoiding(true)} className="btn-ghost h-11 rounded-[10px] text-[#A12A2A]">Batalkan transaksi (void)</button>
              ))}
            </ReceiptView>
          </div>
        )}
      </Sheet>
    </div>
  );
}
