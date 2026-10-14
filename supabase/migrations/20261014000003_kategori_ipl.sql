-- Kategori pengeluaran baru: IPL & iuran lingkungan (biaya tetap bulanan ruko), terpisah dari sewa.
alter table expenses drop constraint expenses_category_check;
alter table expenses add constraint expenses_category_check check (category in ('sewa', 'ipl', 'listrik_air', 'internet_pulsa', 'perlengkapan',
  'kebersihan', 'konsumsi', 'pemasaran', 'transportasi', 'perbaikan', 'pajak_izin', 'kasbon', 'lainnya'));
