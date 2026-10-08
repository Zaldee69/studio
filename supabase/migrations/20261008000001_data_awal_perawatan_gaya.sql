-- Data awal yang sebelumnya hanya ada di seed.sql, dipindah ke migration agar ikut ke database yang sudah berjalan.

-- Perawatan fasilitas: toko belum punya exhaust & HVAC, hanya AC split.
-- Tugas lama tidak dihapus (riwayat maintenance_logs tetap utuh): yang AC diganti nama, exhaust dinonaktifkan.
update maintenance_tasks set name = 'Cuci filter AC' where name = 'Inspeksi HVAC/AC';
update maintenance_tasks set active = false where name = 'Bersihkan exhaust & filter';
insert into maintenance_tasks (name, interval_days)
select 'Cuci filter AC', 14 where not exists (select 1 from maintenance_tasks where name = 'Cuci filter AC');

-- Katalog gaya rambut contoh (foto referensi diunggah manajer di Pengaturan → Katalog gaya).
-- Gaya yang sudah ada / sudah diedit manajer tidak ditimpa.
insert into hairstyles (code, name, category, description, face_shapes, hair_types, hair_density, suitable_lengths, maintenance_level, style_character, sort) values
  ('HS001', 'Textured Crop', 'Short', 'Atas pendek bertekstur dengan poni pendek ke depan, sisi taper/fade.',
   '{oval,round,square,oblong}', '{straight,slightly_wavy,wavy}', '{medium,thick}', '{very_short,short,medium}', 'low', '{modern,clean}', 1),
  ('HS002', 'French Crop', 'Short', 'Poni lurus pendek, atas rata, sisi rapi — tegas & mudah dirawat.',
   '{oval,square,oblong,diamond}', '{straight,slightly_wavy}', '{medium,thick}', '{very_short,short}', 'low', '{clean,classic}', 2),
  ('HS003', 'Low Taper Fade', 'Short', 'Atas sedang dirapikan natural, sisi menipis bertahap rendah di dekat telinga & tengkuk.',
   '{oval,round,square,heart,diamond,oblong}', '{straight,slightly_wavy,wavy,curly}', '{thin,medium,thick}', '{short,medium}', 'low', '{natural,clean}', 3),
  ('HS004', 'Side Part Classic', 'Medium', 'Belahan samping rapi dengan sisi pendek; tampilan profesional.',
   '{oval,square,round,oblong}', '{straight,slightly_wavy}', '{medium,thick}', '{short,medium}', 'medium', '{classic,formal}', 4),
  ('HS005', 'Pompadour Mid Fade', 'Medium', 'Atas panjang disisir ke belakang bervolume, sisi mid fade.',
   '{oval,round,square,heart}', '{straight,slightly_wavy,wavy}', '{medium,thick}', '{medium,long}', 'high', '{bold,classic}', 5),
  ('HS006', 'Two Block / Comma', 'Medium', 'Atas panjang jatuh menutup sebagian dahi, sisi pendek terpisah (gaya Korea).',
   '{oval,oblong,heart,diamond}', '{straight,slightly_wavy}', '{medium,thick}', '{medium,long}', 'medium', '{modern,soft}', 6),
  ('HS007', 'Buzz Cut', 'Short', 'Sangat pendek merata — paling praktis, menonjolkan bentuk kepala.',
   '{oval,square,diamond}', '{straight,slightly_wavy,wavy,curly}', '{thin,medium,thick}', '{very_short,short,medium,long}', 'low', '{minimal,clean}', 7),
  ('HS008', 'Curly Top Fade', 'Short', 'Ikal alami di atas dibiarkan bertekstur, sisi fade rapi.',
   '{oval,round,square,oblong,heart}', '{wavy,curly}', '{medium,thick}', '{short,medium}', 'medium', '{natural,modern}', 8)
on conflict (code) do nothing;
update hairstyles h set highlights = v.p from (values
  ('HS001', '{"Modern & rapi","Atas bertekstur","Samping tipis (low taper)","Cocok untuk semua acara"}'::text[]),
  ('HS002', '{"Poni lurus pendek","Tegas & bersih","Sangat mudah dirawat"}'::text[]),
  ('HS003', '{"Natural & rapi","Transisi samping halus","Cocok hampir semua bentuk wajah"}'::text[]),
  ('HS004', '{"Klasik & profesional","Belah samping rapi","Cocok untuk kerja/formal"}'::text[]),
  ('HS005', '{"Bervolume & tegas","Disisir ke belakang","Butuh styling harian"}'::text[]),
  ('HS006', '{"Gaya ala Korea","Atas lebih panjang","Terlihat lebih muda"}'::text[]),
  ('HS007', '{"Paling praktis","Tanpa styling","Menonjolkan bentuk kepala"}'::text[]),
  ('HS008', '{"Ikal alami ditonjolkan","Samping fade rapi","Perlu produk ringan"}'::text[])
) as v(code, p) where h.code = v.code and h.highlights = '{}';
