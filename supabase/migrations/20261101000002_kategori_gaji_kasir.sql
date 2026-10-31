-- Keputusan owner 1 Nov 2026: siapkan kategori pengeluaran "Gaji kasir" (kasir pengganti Rohman akan digaji studio).
-- Biaya tetap → masuk pengeluaran operasional di laporan owner, bukan upah komisi. Bisa dibuat sebagai pengeluaran rutin bulanan.
alter table expenses drop constraint expenses_category_check;
alter table expenses add constraint expenses_category_check check (category in ('sewa', 'ipl', 'listrik_air', 'internet_pulsa', 'perlengkapan',
  'kebersihan', 'konsumsi', 'pemasaran', 'transportasi', 'perbaikan', 'pajak_izin', 'gaji_kasir', 'kasbon', 'lainnya'));
