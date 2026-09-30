"use client";

import { useState } from "react";
import { METHOD_LABEL } from "@/lib/domain/closing";
import { formatJam, formatRupiah, formatTanggal } from "@/lib/domain/format";
import { cashChange, receiptText, waLink, type Receipt } from "@/lib/domain/receipt";
import type { TxRow } from "../counter/types";

export function toReceipt(tx: TxRow, shop: string, balanceAfter: number | null): Receipt & { whatsapp: string | null; voided: string | null } {
  return {
    shop, when: `${formatTanggal(tx.created_at)} ${formatJam(tx.created_at)}`, customer: tx.customer?.name ?? "Pelanggan umum",
    items: tx.transaction_items.map((i) => ({ name: i.name, price: i.price })),
    subtotal: tx.subtotal, discount: tx.discount_amount, discountLabel: tx.discount_label, depositUsed: tx.deposit_used,
    paid: tx.paid_amount, method: tx.payment_method, cashReceived: tx.cash_received, balanceAfter,
    whatsapp: tx.customer?.whatsapp ?? null, voided: tx.voided_at ? tx.void_reason : null,
  };
}

/** Struk: layar sukses & cetak ulang. Kirim via WhatsApp, cetak 58/80 mm. */
export function ReceiptView({ r, title = "Pembayaran tercatat", children }: {
  r: ReturnType<typeof toReceipt>; title?: string; children?: React.ReactNode;
}) {
  const [paper, setPaper] = useState<58 | 80>(80);
  const change = cashChange(r.paid, r.cashReceived);
  const row = (k: React.ReactNode, v: React.ReactNode, cls = "") => (
    <div className={`flex justify-between gap-3 tabular ${cls}`}><span>{k}</span><span className="shrink-0">{v}</span></div>
  );
  return (
    <div className="flex flex-col gap-4">
      <style>{`@media print { @page { size: ${paper}mm auto; margin: 3mm; } .print-area { font-size: ${paper === 58 ? 10 : 12}px; } }`}</style>
      <div className="print-area flex flex-col gap-3">
        <div className="no-print flex size-[52px] items-center justify-center rounded-full bg-[#D9F2E1] text-[#1F7A45]">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </div>
        <h2 className="no-print font-display text-2xl font-bold">{title}</h2>
        <div className="hidden text-center font-bold print:block">{r.shop}</div>
        <span className="text-[13px] text-muted">{r.customer} · {r.when}</span>
        {r.voided && <p className="rounded-lg bg-[#FFDADA] px-3 py-2 text-[13px] font-semibold text-[#6E1616]">DIBATALKAN (void): {r.voided}</p>}
        <div className="flex flex-col gap-1.5 border-y border-[#EFECE5] py-3 text-sm">
          {r.items.map((it, i) => <div key={i}>{row(it.name, formatRupiah(it.price))}</div>)}
        </div>
        <div className="flex flex-col gap-1.5 text-sm">
          {row("Subtotal", formatRupiah(r.subtotal))}
          {r.discount > 0 && row(r.discountLabel, `−${formatRupiah(r.discount)}`, "text-accent-ink")}
          {r.depositUsed > 0 && row("Potong saldo deposit", `−${formatRupiah(r.depositUsed)}`)}
          {row(`Dibayar (${METHOD_LABEL[r.method]})`, formatRupiah(r.paid), "pt-1.5 text-lg font-bold")}
          {r.cashReceived != null && row("Uang diterima", formatRupiah(r.cashReceived))}
          {change != null && row("Kembalian", formatRupiah(change), "font-bold")}
          {r.balanceAfter != null && (r.depositUsed > 0 || r.balanceAfter > 0) && row("Sisa saldo deposit", formatRupiah(r.balanceAfter), "text-muted")}
        </div>
        <div className="hidden pt-2 text-center print:block">Terima kasih!</div>
      </div>
      <div className="no-print flex flex-col gap-2">
        <a href={waLink(r.whatsapp, receiptText(r))} target="_blank" rel="noopener" className="btn h-12 rounded-xl bg-[#1F7A45] text-white hover:bg-[#186238]">
          Kirim struk via WhatsApp
        </a>
        <div className="flex gap-2">
          <label htmlFor="paper" className="sr-only">Ukuran kertas</label>
          <select id="paper" className="input w-28" value={paper} onChange={(e) => setPaper(+e.target.value as 58 | 80)}>
            <option value={80}>80 mm</option><option value={58}>58 mm</option>
          </select>
          <button onClick={() => window.print()} className="btn-ghost h-11 flex-1 rounded-[10px]">Cetak</button>
        </div>
        {children}
      </div>
    </div>
  );
}
