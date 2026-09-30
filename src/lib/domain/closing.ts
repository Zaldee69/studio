// Rekap harian kasir. Cermin cash_summary() di SQL (yang disimpan saat tutup kasir).
import type { PayMethod } from "./cart";

export interface TxRow { total: number; paid_amount: number; deposit_used: number; discount_amount: number; payment_method: PayMethod; voided_at: string | null }
export interface TopupRow { amount_paid: number; amount_credited: number; method: PayMethod }

export function dailySummary(txs: TxRow[], topups: TopupRow[]) {
  const ok = txs.filter((t) => !t.voided_at);
  const sum = (rows: TxRow[], f: (t: TxRow) => number) => rows.reduce((a, t) => a + f(t), 0);
  const cashSales = sum(ok.filter((t) => t.payment_method === "cash" || t.payment_method === "deposit_cash"), (t) => t.paid_amount);
  const topupCash = topups.filter((t) => t.method === "cash").reduce((a, t) => a + t.amount_paid, 0);
  return {
    txCount: ok.length,
    grossTotal: sum(ok, (t) => t.total),
    discountTotal: sum(ok, (t) => t.discount_amount),
    cashSales,
    qrisSales: sum(ok.filter((t) => t.payment_method === "qris" || t.payment_method === "deposit_qris"), (t) => t.paid_amount),
    depositUsed: sum(ok, (t) => t.deposit_used),
    topupCash,
    topupQris: topups.filter((t) => t.method === "qris").reduce((a, t) => a + t.amount_paid, 0),
    expectedCash: cashSales + topupCash,
    voidedCount: txs.length - ok.length,
  };
}

export const METHOD_LABEL: Record<PayMethod, string> = {
  cash: "Tunai", qris: "QRIS", deposit: "Deposit", deposit_cash: "Deposit + Tunai", deposit_qris: "Deposit + QRIS",
};
