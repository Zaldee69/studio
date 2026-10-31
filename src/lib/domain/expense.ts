// Sama dengan check constraint expenses.category / expenses.source (migration 20261011000002, 000003, 20261101000002).
// 'kasbon' = uang muka gaji: wajib pilih staf, otomatis jadi potongan gaji bulan itu.
export const EXPENSE_CAT = {
  sewa: "Sewa tempat", ipl: "IPL & iuran lingkungan", listrik_air: "Listrik & air", internet_pulsa: "Internet & pulsa", perlengkapan: "Perlengkapan",
  kebersihan: "Kebersihan", konsumsi: "Konsumsi", pemasaran: "Pemasaran", transportasi: "Transportasi",
  perbaikan: "Perbaikan kecil", pajak_izin: "Pajak & izin", gaji_kasir: "Gaji kasir", kasbon: "Kasbon staf", lainnya: "Lainnya",
} as const;
export type ExpenseCat = keyof typeof EXPENSE_CAT;

// "transfer" = rekening bank toko, termasuk dana QRIS yang sudah masuk rekening
export const EXPENSE_SOURCE = { laci: "Laci kas", kas_toko: "Kas toko (brankas)", transfer: "Rekening bank (termasuk dana QRIS)" } as const;
export type ExpenseSource = keyof typeof EXPENSE_SOURCE;
