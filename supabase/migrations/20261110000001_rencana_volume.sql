-- Rencana volume pelanggan (10 Nov), lanjutan 20261109000003 yang sudah jalan di prod dengan 30 tugas awal.
-- Data prod 10 Nov: pelanggan ber-WA yang pernah datang baru 63 (60 datang <2 minggu lalu → jatuh tempo mulai ±23 Nov);
-- 186 kontak impor HP owner belum pernah datang; Sen–Kam 10.00–16.00 sepi (±0,3 potong/jam).
-- Maka: WA 12 & 16 Nov diarahkan ke kontak impor, WA 23 & 30 Nov ke pelanggan baru yang jatuh tempo, iklan & brosur
-- memakai pesan "Senin–Kamis siang langsung dilayani", tambah brosur Kids Cut pulang sekolah dan cek progres tiap Senin.
-- Diubah lewat UPDATE (bukan hapus) supaya riwayat manager_task_log mencatat perubahannya (oleh "Sistem").
update manager_tasks set title = 'WA personal ke kontak lama yang belum pernah datang (186 nomor dari HP owner): 20 nomor per hari Senin–Kamis, satu per satu, tawarkan "kami bookingkan" untuk Senin–Kamis',
  measure = '≥4 kontak datang per minggu; ≥15% membalas', grows_customers = true
  where title like 'WA satu per satu ke ±25 pelanggan%' and status = 'belum';
update manager_tasks set title = 'WA personal ke kontak lama gelombang 2 (lanjutan 186 nomor), 20 per hari Senin–Kamis',
  measure = '≥4 kontak datang per minggu'
  where title like 'WA personal rutin Senin 16 dan Kamis 19 Nov%' and status = 'belum';
update manager_tasks set title = 'WA personal ke pelanggan yang datang 26 Okt–8 Nov (±60 orang, mulai jatuh tempo potong ulang), Senin 23 dan Kamis 26 Nov',
  measure = '≥8 pelanggan lama kembali minggu ini'
  where title like 'WA personal rutin Senin 23 dan Kamis 26 Nov%' and status = 'belum';
update manager_tasks set title = 'WA personal ke pelanggan yang 3–4 minggu belum potong, Senin 30 Nov dan Kamis 3 Des',
  measure = '≥10 pelanggan lama kembali minggu ini'
  where title like 'WA personal rutin Senin 30 Nov dan Kamis 3 Des%' and status = 'belum';
update manager_tasks set title = 'Siapkan iklan Meta (IG/FB) radius ±3 km, Rp750 rb untuk 2 minggu, tayang Senin–Kamis 09.00–16.00 mulai Kamis 19 Nov dengan pesan "siang hari kerja langsung dilayani"; kasir mencatat sumber "iklan"',
  measure = 'iklan tayang 19 Nov; ≥8 pelanggan baru dari iklan per minggu'
  where title like 'Siapkan iklan Meta%' and status = 'belum';
update manager_tasks set title = 'Cetak brosur atau kartu kecil (≤Rp300 rb) berisi "Senin–Kamis siang langsung dilayani", titip ke pos satpam dan pengelola, kirim ke grup WA warga'
  where title like 'Cetak brosur atau kartu kecil%' and status = 'belum';

insert into manager_tasks (title, pic, due, measure, grows_customers) values
  ('Titip brosur "Kids Cut pulang sekolah, Senin–Kamis 14.00–17.00" ke 2 sekolah/TK terdekat dan masjid perumahan', 'Manajer', date '2026-11-19', '≥3 Kids Cut Senin–Kamis per minggu', true),
  ('Senin pagi: cek progres minggu lalu di Rencana & Target; kalau potong di bawah jalur, tambah 20 WA personal minggu ini', 'Manajer', date '2026-11-16', 'progres dicek dan tindakan tambahan dicatat di catatan', true),
  ('Senin pagi: cek progres minggu lalu di Rencana & Target; kalau potong di bawah jalur, tambah 20 WA personal minggu ini', 'Manajer', date '2026-11-23', 'progres dicek dan tindakan tambahan dicatat di catatan', true),
  ('Senin pagi: cek progres minggu lalu di Rencana & Target; kalau potong di bawah jalur, tambah 20 WA personal minggu ini', 'Manajer', date '2026-11-30', 'progres dicek dan tindakan tambahan dicatat di catatan', true);
