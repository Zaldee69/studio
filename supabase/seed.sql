-- Data awal katalog (placeholder — ganti dari Pengaturan). Aman untuk produksi.
-- Akun demo & jadwal contoh ada di seed-demo.sql (HANYA lokal).

update settings set shop_address = 'Cimanggis Golf Estate (Ruko Emerald), Cimanggis, Kota Depok, Jawa Barat', shop_whatsapp = '6281200000000',
  shop_instagram = '';

-- ---------- Staf ----------
insert into staff (id, name, category, sort) values
  ('00000000-0000-0000-0001-000000000001', 'Andi',  'barbershop', 1),
  ('00000000-0000-0000-0001-000000000002', 'Rizky', 'barbershop', 2),
  ('00000000-0000-0000-0001-000000000003', 'Dimas', 'barbershop', 3),
  ('00000000-0000-0000-0001-000000000004', 'Sari',  'nail', 4),
  ('00000000-0000-0000-0001-000000000005', 'Maya',  'nail', 5),
  ('00000000-0000-0000-0001-000000000006', 'Dewi',  'nail', 6);

-- ---------- Resources ----------
insert into resources (name, type, is_pedicure, sort) values
  ('Kursi Barber 1', 'barbershop', false, 1), ('Kursi Barber 2', 'barbershop', false, 2),
  ('Kursi Barber 3', 'barbershop', false, 3), ('Meja Manicure 1', 'nail', false, 4),
  ('Meja Manicure 2', 'nail', false, 5), ('Meja Manicure 3', 'nail', false, 6),
  ('Kursi Pedicure', 'nail', true, 7);

-- Kursi/meja utama staf contoh (diutamakan saat booking, tetap boleh pindah bila terpakai)
update staff s set home_resource_id = r.id
from (values ('Andi', 'Kursi Barber 1'), ('Rizky', 'Kursi Barber 2'), ('Dimas', 'Kursi Barber 3'),
             ('Sari', 'Meja Manicure 1'), ('Maya', 'Meja Manicure 2'), ('Dewi', 'Meja Manicure 3')) m(staff, res)
join resources r on r.name = m.res
where s.name = m.staff;

-- ---------- Inventaris ----------
insert into inventory_items (name, kind, unit, unit_cost, reorder_at) values
  ('Shampoo salon', 'consumable', 'ml', 50, 1000),
  ('Krim hair spa', 'consumable', 'ml', 150, 500),
  ('Pisau cukur', 'consumable', 'pcs', 2500, 20),
  ('Neck strip', 'consumable', 'pcs', 300, 100),
  ('Gel base/top', 'consumable', 'ml', 2000, 50),
  ('Gel warna', 'consumable', 'ml', 3000, 50),
  ('Remover', 'consumable', 'ml', 100, 500),
  ('Kapas & tisu', 'consumable', 'pcs', 200, 200),
  ('Callus remover', 'consumable', 'ml', 400, 200),
  ('Foot scrub', 'consumable', 'g', 150, 300),
  ('Cat rambut', 'consumable', 'tube', 45000, 5),
  ('Pomade Matte', 'retail', 'pcs', 60000, 5),
  ('Cuticle Oil', 'retail', 'pcs', 30000, 5),
  ('Shampoo Anti-Ketombe', 'retail', 'pcs', 50000, 4);

insert into stock_moves (item_id, qty, type, unit_cost, note)
select id, case unit when 'ml' then 5000 when 'g' then 3000 when 'tube' then 20 else 300 end, 'in', unit_cost, 'Stok awal'
from inventory_items where kind = 'consumable';
insert into stock_moves (item_id, qty, type, unit_cost, note)
select id, 12, 'in', unit_cost, 'Stok awal' from inventory_items where kind = 'retail';

-- ---------- Layanan ----------
insert into services (name, category, price, duration_min, needs_pedicure, sort) values
  ('Potong Rambut', 'barbershop', 75000, 45, false, 1),
  ('Potong + Cuci + Styling', 'barbershop', 95000, 60, false, 2),
  ('Hair Spa', 'barbershop', 85000, 30, false, 3),
  ('Cukur Jenggot', 'barbershop', 45000, 20, false, 4),
  ('Hair Coloring', 'barbershop', 250000, 90, false, 5),
  ('Manicure Basic', 'nail', 90000, 45, false, 6),
  ('Pedicure Basic', 'nail', 120000, 60, true, 7),
  ('Gel Polish Tangan', 'nail', 180000, 60, false, 8),
  ('Callus Treatment', 'nail', 95000, 30, true, 9),
  ('Nail Art per set', 'nail', 150000, 45, false, 10);

insert into services (name, category, price, duration_min, stock_item_id, sort)
select i.name, 'retail', p.price, 0, i.id, p.sort
from (values ('Pomade Matte', 110000, 11), ('Cuticle Oil', 65000, 12), ('Shampoo Anti-Ketombe', 90000, 13)) p(name, price, sort)
join inventory_items i on i.name = p.name;

update services s set upsell_service_id = u.id
from (values ('Potong Rambut', 'Hair Spa'), ('Potong + Cuci + Styling', 'Hair Spa'),
             ('Manicure Basic', 'Callus Treatment'), ('Pedicure Basic', 'Callus Treatment'),
             ('Gel Polish Tangan', 'Cuticle Oil')) m(svc, up)
join services u on u.name = m.up
where s.name = m.svc;

-- Resep HPP
insert into service_materials (service_id, item_id, qty)
select s.id, i.id, r.qty
from (values
  ('Potong Rambut', 'Shampoo salon', 20), ('Potong Rambut', 'Neck strip', 1),
  ('Potong + Cuci + Styling', 'Shampoo salon', 30), ('Potong + Cuci + Styling', 'Neck strip', 1),
  ('Hair Spa', 'Shampoo salon', 20), ('Hair Spa', 'Krim hair spa', 40),
  ('Cukur Jenggot', 'Pisau cukur', 1), ('Cukur Jenggot', 'Kapas & tisu', 2),
  ('Hair Coloring', 'Cat rambut', 1), ('Hair Coloring', 'Shampoo salon', 30), ('Hair Coloring', 'Neck strip', 1),
  ('Manicure Basic', 'Remover', 10), ('Manicure Basic', 'Kapas & tisu', 5),
  ('Pedicure Basic', 'Foot scrub', 30), ('Pedicure Basic', 'Remover', 10), ('Pedicure Basic', 'Kapas & tisu', 5),
  ('Gel Polish Tangan', 'Gel base/top', 2), ('Gel Polish Tangan', 'Gel warna', 2),
  ('Gel Polish Tangan', 'Remover', 10), ('Gel Polish Tangan', 'Kapas & tisu', 5),
  ('Callus Treatment', 'Callus remover', 15), ('Callus Treatment', 'Kapas & tisu', 3),
  ('Nail Art per set', 'Gel warna', 3), ('Nail Art per set', 'Gel base/top', 1)
) r(svc, item, qty)
join services s on s.name = r.svc
join inventory_items i on i.name = r.item;

-- ---------- Deposit, SOP, perawatan ----------
insert into deposit_packages (name, amount_paid, amount_credited) values
  ('Classic', 500000, 550000), ('Signature', 1000000, 1125000), ('Prestige', 1500000, 1750000);

insert into sop_tool_groups (name, sort) values
  ('Gunting & clipper blade', 1), ('Alat cukur', 2), ('Pusher & nipper', 3), ('Alat pedicure', 4);

insert into maintenance_tasks (name, interval_days) values
  ('Cuci filter AC', 14);


-- ---------- Katalog gaya rambut (contoh; unggah foto referensi di Pengaturan → Katalog gaya) ----------
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
   '{oval,round,square,oblong,heart}', '{wavy,curly}', '{medium,thick}', '{short,medium}', 'medium', '{natural,modern}', 8);
update hairstyles h set highlights = v.p from (values
  ('HS001', '{"Modern & rapi","Atas bertekstur","Samping tipis (low taper)","Cocok untuk semua acara"}'::text[]),
  ('HS002', '{"Poni lurus pendek","Tegas & bersih","Sangat mudah dirawat"}'::text[]),
  ('HS003', '{"Natural & rapi","Transisi samping halus","Cocok hampir semua bentuk wajah"}'::text[]),
  ('HS004', '{"Klasik & profesional","Belah samping rapi","Cocok untuk kerja/formal"}'::text[]),
  ('HS005', '{"Bervolume & tegas","Disisir ke belakang","Butuh styling harian"}'::text[]),
  ('HS006', '{"Gaya ala Korea","Atas lebih panjang","Terlihat lebih muda"}'::text[]),
  ('HS007', '{"Paling praktis","Tanpa styling","Menonjolkan bentuk kepala"}'::text[]),
  ('HS008', '{"Ikal alami ditonjolkan","Samping fade rapi","Perlu produk ringan"}'::text[])
) as v(code, p) where h.code = v.code;
