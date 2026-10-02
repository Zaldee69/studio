"use client";

import { useState } from "react";
import { PrintSheet } from "@/components/print-sheet";
import { METHOD_LABEL } from "@/lib/domain/closing";
import { formatJam, formatRupiah, formatTanggal } from "@/lib/domain/format";
import { cashChange, receiptText, waLink, type Receipt } from "@/lib/domain/receipt";
import type { Shop, TxRow } from "../counter/types";

export type ReceiptData = Receipt & { whatsapp: string | null; voided: string | null };

export function toReceipt(tx: TxRow, shop: Shop, staffName: (id: string | null) => string | null | undefined,
  balanceAfter: number | null, cashier?: string | null): ReceiptData {
  return {
    shop: shop.name, shopAddress: shop.address, shopWhatsapp: shop.whatsapp, shopInstagram: shop.instagram,
    no: tx.id.slice(0, 8).toUpperCase(), cashier: cashier ?? null,
    when: `${formatTanggal(tx.created_at)} ${formatJam(tx.created_at)}`, customer: tx.customer?.name ?? "Pelanggan umum",
    items: tx.transaction_items.map((i) => ({ name: i.name, price: i.price, staff: staffName(i.staff_id) ?? null })),
    subtotal: tx.subtotal, discount: tx.discount_amount, discountLabel: tx.discount_label, depositUsed: tx.deposit_used,
    paid: tx.paid_amount, method: tx.payment_method, cashReceived: tx.cash_received, balanceAfter,
    whatsapp: tx.customer?.whatsapp ?? null, voided: tx.voided_at ? tx.void_reason : null,
  };
}

const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/^https?:\/\//, "").replace(/\/$/, "");
const waDisplay = (wa: string) => (wa.startsWith("62") ? `0${wa.slice(2)}` : wa);

/** Struk modern — satu tampilan untuk pratinjau di layar dan lembar cetak (58/80 mm). */
function ReceiptPaper({ r, paper }: { r: ReceiptData; paper?: 58 | 80 }) {
  const change = cashChange(r.paid, r.cashReceived);
  const small = paper === 58;
  const row = (k: React.ReactNode, v: React.ReactNode, cls = "") => (
    <div className={`flex justify-between gap-3 tabular ${cls}`}><span>{k}</span><span className="shrink-0 text-right">{v}</span></div>
  );
  const dash = "border-t border-dashed border-[#B9B3A7]";
  return (
    <div className={`flex flex-col gap-3 text-[#1c1b19] ${small ? "text-[10px]" : "text-[12px]"}`} style={{ fontFamily: "var(--font-sans), system-ui, sans-serif" }}>
      {/* kepala */}
      <div className="flex flex-col items-center gap-1 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- ikon SVG lokal, tidak perlu optimasi gambar */}
        <img src="/icon.svg" alt="" className={small ? "size-8" : "size-10"} />
        <b className={`${small ? "text-[13px]" : "text-[16px]"} uppercase tracking-[0.18em]`}>{r.shop}</b>
        {r.shopAddress && <span className="leading-snug text-[#5A5A5A]">{r.shopAddress}</span>}
        {(r.shopWhatsapp || r.shopInstagram) && (
          <span className="text-[#5A5A5A]">{[r.shopWhatsapp && `WA ${waDisplay(r.shopWhatsapp)}`, r.shopInstagram && `IG ${r.shopInstagram.startsWith("@") ? r.shopInstagram : `@${r.shopInstagram}`}`].filter(Boolean).join(" · ")}</span>
        )}
      </div>

      {/* status */}
      <div className="flex justify-center">
        <span className={`rounded-full px-3 py-0.5 text-[0.85em] font-bold uppercase tracking-[0.2em] ${r.voided ? "bg-[#FFDADA] text-[#6E1616]" : "bg-[#D9F2E1] text-[#144D2A]"}`}>
          {r.voided ? "DIBATALKAN (void)" : "LUNAS"}
        </span>
      </div>
      {r.voided && <p className="text-center text-[0.9em] text-[#6E1616]">Alasan void: {r.voided}</p>}

      {/* meta */}
      <div className={`${dash} grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 pt-2.5`}>
        {r.no && <><span className="text-[#5A5A5A]">No. struk</span><span className="text-right font-semibold tabular">#{r.no}</span></>}
        <span className="text-[#5A5A5A]">Tanggal</span><span className="text-right tabular">{r.when}</span>
        <span className="text-[#5A5A5A]">Pelanggan</span><span className="text-right">{r.customer}</span>
        {r.cashier && <><span className="text-[#5A5A5A]">Kasir</span><span className="text-right">{r.cashier}</span></>}
      </div>

      {/* item */}
      <div className={`${dash} flex flex-col gap-2 pt-2.5`}>
        {r.items.map((it, i) => (
          <div key={i} className="flex justify-between gap-3">
            <span className="flex min-w-0 flex-col"><span className="font-semibold">{it.name}</span>{it.staff && <span className="text-[0.9em] text-[#5A5A5A]">oleh {it.staff}</span>}</span>
            <span className="shrink-0 tabular">{formatRupiah(it.price)}</span>
          </div>
        ))}
      </div>

      {/* total */}
      <div className={`${dash} flex flex-col gap-1 pt-2.5`}>
        {row("Subtotal", formatRupiah(r.subtotal))}
        {r.discount > 0 && row(r.discountLabel || "Diskon", `−${formatRupiah(r.discount)}`)}
        {r.depositUsed > 0 && row("Potong saldo deposit", `−${formatRupiah(r.depositUsed)}`)}
      </div>
      <div className="flex items-baseline justify-between gap-3 rounded-lg bg-[#1c1b19] px-3 py-2 text-white">
        <span className="text-[0.85em] font-bold uppercase tracking-[0.15em]">Total</span>
        <span className={`${small ? "text-[15px]" : "text-[19px]"} font-bold tabular`}>{formatRupiah(r.paid + r.depositUsed)}</span>
      </div>
      <div className="flex flex-col gap-1">
        {row(`Dibayar (${METHOD_LABEL[r.method]})`, formatRupiah(r.paid), "font-semibold")}
        {r.cashReceived != null && row("Uang diterima", formatRupiah(r.cashReceived))}
        {change != null && row("Kembalian", formatRupiah(change), "font-semibold")}
        {r.balanceAfter != null && (r.depositUsed > 0 || r.balanceAfter > 0) && row("Sisa saldo deposit", formatRupiah(r.balanceAfter), "text-[#5A5A5A]")}
      </div>

      {/* kaki */}
      <div className={`${dash} flex flex-col items-center gap-0.5 pt-2.5 text-center`}>
        <b>Terima kasih, sampai jumpa lagi!</b>
        {site && <span className="text-[#5A5A5A]">Booking online: {site}/booking</span>}
        <span className="text-[0.85em] text-[#8a8377]">Simpan struk ini sebagai bukti pembayaran.</span>
      </div>
    </div>
  );
}

/** Struk: layar sukses & cetak ulang. Kirim via WhatsApp, cetak 58/80 mm. */
export function ReceiptView({ r, title = "Pembayaran tercatat", children }: { r: ReceiptData; title?: string; children?: React.ReactNode }) {
  const [paper, setPaper] = useState<58 | 80>(80);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#D9F2E1] text-[#1F7A45]">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12l5 5L20 7" /></svg>
        </div>
        <h2 className="font-display text-2xl font-bold">{title}</h2>
      </div>
      {/* pratinjau: kertas struk */}
      <div className="rounded-[4px] border border-line bg-white p-4 shadow-[0_1px_0_#e4e0d6,0_8px_24px_-12px_rgba(28,27,25,0.25)]">
        <ReceiptPaper r={r} />
      </div>
      <PrintSheet page={`size: ${paper}mm auto; margin: ${paper === 58 ? 2 : 4}mm`}>
        <ReceiptPaper r={r} paper={paper} />
      </PrintSheet>
      <div className="flex flex-col gap-2">
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
