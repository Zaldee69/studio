// Alasan void yang berarti tidak ada uang tunai keluar dari laci (salah sumber/metode, uji coba).
export const noRefundReason = (r: string) => /salah\s+sumber|\btest\b|\btes\b/i.test(r);
