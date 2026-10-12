-- Pijat lebih lama (mis. 1,5 / 2 jam): layanan tambahan durasi, dipilih bersama layanan pijat utama
-- (jadwal bed & terapis, tagihan, dan komisi ikut otomatis). Harga awal proporsional Pijat Fullbody
-- (Rp80.000 / 60 menit) — ubah di Pengaturan → Layanan bila harga toko berbeda. Hanya lewat kasir/WA.
insert into services (name, category, price, duration_min, online_bookable, public_description, sort)
select v.name, 'massage', v.price, v.dur, false, v.descr, v.sort from (values
  ('Tambah waktu pijat 30 menit', 40000, 30, 'Perpanjangan waktu pijat 30 menit.', 11),
  ('Tambah waktu pijat 60 menit', 80000, 60, 'Perpanjangan waktu pijat 60 menit.', 12)
) v(name, price, dur, descr, sort)
where not exists (select 1 from services s where s.name = v.name);
