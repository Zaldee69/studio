// Sama dengan check constraint expenses.category / expenses.source (migration 20261011000002).
export const EXPENSE_CAT = {
  sewa: "Sewa tempat", listrik_air: "Listrik & air", internet_pulsa: "Internet & pulsa", perlengkapan: "Perlengkapan",
  kebersihan: "Kebersihan", konsumsi: "Konsumsi", pemasaran: "Pemasaran", transportasi: "Transportasi",
  perbaikan: "Perbaikan kecil", pajak_izin: "Pajak & izin", lainnya: "Lainnya",
} as const;
export type ExpenseCat = keyof typeof EXPENSE_CAT;

export const EXPENSE_SOURCE = { laci: "Laci kas", kas_toko: "Kas toko (brankas)", transfer: "Transfer bank" } as const;
export type ExpenseSource = keyof typeof EXPENSE_SOURCE;
