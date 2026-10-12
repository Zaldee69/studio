-- Durasi layanan disesuaikan dengan data kerja nyata (prod s.d. 11/10, dari jam Mulai→Selesai):
--   Potong Rambut  45 → 30 mnt (rata-rata 20, 80% selesai ≤ 25 mnt; 28 kunjungan)
-- Pijat Fullbody tetap 60 mnt (sesuai daftar harga); sesi lebih lama memakai layanan "Tambah waktu pijat".
-- Hanya bila masih nilai lama (tidak menimpa perubahan manual di Pengaturan). Booking yang sudah ada tetap memakai durasinya.
update services set duration_min = 30 where name = 'Potong Rambut' and duration_min = 45;
