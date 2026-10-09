// Baris ringkasan laporan owner — dipakai halaman PDF dan file Excel (satu daftar, label & aturan sama).
import type { OwnerReport, OwnerSummary } from "./owner";

export type RowKind = "money" | "int" | "pct";
export type SummaryRow = { key: keyof OwnerSummary; label: string; kind: RowKind; lowerBetter?: boolean; target?: (t: OwnerReport["targets"]) => number | null };

export const SUMMARY_ROWS: SummaryRow[] = [
  { key: "net", label: "Omzet bersih", kind: "money", target: (t) => t.revenue || null },
  { key: "margin", label: "Margin kotor (omzet − HPP)", kind: "money" },
  { key: "margin_pct", label: "Margin kotor %", kind: "pct" },
  { key: "tx_count", label: "Transaksi", kind: "int" },
  { key: "aov", label: "AOV (rata-rata per transaksi)", kind: "money" },
  { key: "aov_barbershop", label: "AOV Barbershop", kind: "money", target: (t) => t.aov_barbershop || null },
  { key: "aov_nail", label: "AOV Nail", kind: "money", target: (t) => t.aov_nail || null },
  { key: "rev_barbershop", label: "Omzet Barbershop", kind: "money" },
  { key: "rev_nail", label: "Omzet Nail Art", kind: "money" },
  { key: "rev_retail", label: "Omzet Ritel", kind: "money" },
  { key: "retail_ratio", label: "Rasio ritel : jasa", kind: "pct" },
  { key: "utilization", label: "Utilisasi kursi/meja", kind: "pct", target: (t) => t.utilization || null },
  { key: "new_customers", label: "Pelanggan baru", kind: "int" },
  { key: "returning", label: "Pelanggan kembali", kind: "int" },
  { key: "return_rate", label: "Tingkat kembali", kind: "pct" },
  { key: "no_show_rate", label: "No-show", kind: "pct", lowerBetter: true },
  { key: "online_share", label: "Porsi booking online", kind: "pct" },
  { key: "sop_compliance", label: "Kepatuhan SOP", kind: "pct" },
  { key: "void_count", label: "Transaksi di-void", kind: "int", lowerBetter: true },
  { key: "topup_paid", label: "Top-up deposit (uang masuk)", kind: "money" },
];

/** Perubahan: persen untuk uang/jumlah, poin persentase untuk metrik persen. */
export function change(kind: RowKind, cur: number | null | undefined, prev: number | null | undefined): { value: number | null; unit: "%" | "poin" } {
  if (cur == null || prev == null) return { value: null, unit: kind === "pct" ? "poin" : "%" };
  if (kind === "pct") return { value: cur - prev, unit: "poin" };
  return { value: prev ? ((cur - prev) * 100) / prev : null, unit: "%" };
}

export const WEEKDAY = ["", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"]; // isodow 1..7
export const CAT_NAME = { barbershop: "Barbershop", nail: "Nail Art", massage: "Pijat", retail: "Ritel" } as const;
