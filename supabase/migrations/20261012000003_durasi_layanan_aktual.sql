-- Durasi layanan disesuaikan dengan data kerja nyata (prod s.d. 11/10, dari jam Mulai→Selesai):
--   Potong Rambut  45 → 30 mnt (rata-rata 20, 80% selesai ≤ 25 mnt; 28 kunjungan)
--   Pijat Fullbody 60 → 75 mnt (rata-rata 75, 80% selesai ≤ 81 mnt; 4 kunjungan)
-- Hanya bila masih nilai lama (tidak menimpa perubahan manual di Pengaturan). Booking yang sudah ada tetap memakai durasinya.
update services set duration_min = 30 where name = 'Potong Rambut' and duration_min = 45;
update services set duration_min = 75 where name = 'Pijat Fullbody' and duration_min = 60;
