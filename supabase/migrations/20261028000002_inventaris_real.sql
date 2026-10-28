-- Inventaris & HPP asli (28 Okt 2026). Data bahan dan stok bawaan seed adalah contoh fiktif; diganti dengan bahan nyata dari
-- daftar inventaris owner, harga dari nota/marketplace/perkiraan (dokumen "HPP Layanan D'Pras"), dan takaran usulan
-- (dicek capster/terapis). Stok nyata diisi lewat Stok Opname di aplikasi — migrasi ini tidak mengarang jumlah stok.
--
-- Hanya berjalan pada database yang sudah berisi data (prod / lokal ber-seed); pada `db reset` migrasi jalan sebelum seed,
-- jadi dilewati dan seed tetap utuh untuk test.
do $$
declare
  reason constant text := 'Ganti data contoh dengan harga asli (28 Okt 2026)';
  missing text;
  s record;
  b jsonb; a jsonb;
begin
  if not exists (select 1 from services) then return; end if;

  -- 1) "Stok awal" fiktif dari seed (3 Okt): 14 baris buatan sistem, tanpa pengguna & tanpa "dibayar dari". Dihapus, bukan
  --    disesuaikan, supaya laporan owner tidak mencatat "stok susut" palsu. Pengaman riwayat stok dimatikan HANYA untuk
  --    baris ini lalu dinyalakan lagi. Pemakaian nyata (type use) tetap disimpan.
  alter table stock_moves disable trigger stock_moves_immutable;
  delete from stock_moves where type = 'in' and note = 'Stok awal' and paid_from is null and created_by is null;
  alter table stock_moves enable trigger stock_moves_immutable;

  -- 2) Bahan & barang ritel contoh dinonaktifkan (riwayat tetap ada).
  update inventory_items set active = false
  where name in ('Callus remover', 'Foot scrub', 'Gel base/top', 'Gel warna', 'Remover', 'Krim hair spa', 'Cat rambut',
                 'Kapas & tisu', 'Cuticle Oil', 'Pomade Matte', 'Shampoo Anti-Ketombe');

  -- 3) Bahan nyata: harga per satuan (Rp), ambang reorder (pemakaian harian × ±7 hari kirim+cadangan) & isi kemasan
  --    (min_order_qty — saran Daftar belanja dibulatkan ke kelipatannya). Yang sudah ada diperbarui (tercatat di cost_changes), yang belum ada ditambah.
  create temp table real_items (name text, unit text, cost numeric, rename_from text, reorder_at numeric default 0, pack numeric) on commit drop;
  insert into real_items values
    ('Neck strip', 'pcs', 200, null, 60, 100),
    ('Pisau cukur', 'pcs', 1300, null, 60, 100),
    ('Sampo', 'ml', 25, 'Shampoo salon', 300, 1000),
    ('Busa cukur', 'ml', 257, null, 100, 175),
    ('Bedak leher', 'g', 100, null, 50, 150),
    ('Tonik rambut', 'ml', 543, null, 100, 140),
    ('Clay Gatsby', 'g', 381, null, 80, 80),
    ('Krim creambath', 'ml', 77, null, 150, 500),
    ('Masker wajah', 'g', 421, null, 50, 100),
    ('Pewarna rambut hitam', 'tube', 25000, null, 0, null),
    ('Oksidan 20 vol', 'ml', 60, null, 0, null),
    ('Oksidan 40 vol', 'ml', 60, null, 0, null),
    ('Bubuk bleaching', 'g', 180, null, 0, null),
    ('Obat keriting & penetral', 'aplikasi', 15000, null, 0, null),
    ('Sarung tangan', 'pasang', 938, null, 10, 50),
    ('Minyak pijat Anjelina', 'ml', 90.2, null, 150, 1000),
    ('Krim pijat Anjelina', 'g', 34.7, null, 700, 1000),
    ('Alas pijat / tisu', 'lembar', 200, null, 30, 100),
    ('Lanset bekam', 'pcs', 350, null, 30, 100),
    ('Lilin ear candle', 'pcs', 5000, null, 0, null);

  update inventory_items i set name = r.name from real_items r where r.rename_from is not null and i.name = r.rename_from and i.kind = 'consumable';
  insert into cost_changes (item_id, before, after, reason)
    select i.id, i.unit_cost, r.cost, reason from inventory_items i join real_items r on r.name = i.name
    where i.kind = 'consumable' and i.unit_cost is distinct from r.cost;
  perform set_config('app.via_cost', 'on', true);
  update inventory_items i set unit_cost = r.cost, unit = r.unit, active = true, reorder_at = r.reorder_at, min_order_qty = r.pack
    from real_items r where r.name = i.name and i.kind = 'consumable';
  perform set_config('app.via_cost', 'off', true);
  insert into inventory_items (name, kind, unit, unit_cost, reorder_at, min_order_qty)
    select r.name, 'consumable', r.unit, r.cost, r.reorder_at, r.pack from real_items r
    where not exists (select 1 from inventory_items i where i.name = r.name and i.kind = 'consumable');

  -- 3b) Stok awal perkiraan dari daftar inventaris owner (foto 15 Okt) × isi kemasan di dokumen HPP, plus pembelian krim &
  --     minyak pijat Anjelina (nota). Angka minimal/perkiraan — dikoreksi lewat Stok Opname. Tanpa "dibayar dari" (bukan
  --     pembelian baru di arus kas), sama seperti stok awal sebelumnya.
  insert into stock_moves (item_id, qty, type, unit_cost, note)
    select i.id, v.qty, 'in', i.unit_cost, 'Stok awal dari daftar inventaris (perkiraan, 15 Okt 2026) — cek lewat Stok Opname'
    from (values ('Neck strip', 1000), ('Busa cukur', 350), ('Bedak leher', 150), ('Tonik rambut', 350), ('Krim creambath', 1500),
                 ('Pewarna rambut hitam', 2), ('Oksidan 20 vol', 1000), ('Oksidan 40 vol', 1000), ('Bubuk bleaching', 500),
                 ('Obat keriting & penetral', 4), ('Krim pijat Anjelina', 5000), ('Minyak pijat Anjelina', 1000)) v(name, qty)
    join inventory_items i on i.name = v.name and i.kind = 'consumable' and i.active;

  -- 4) Resep per layanan (takaran per pelanggan). Layanan yang tidak ada di database ini dilewati.
  create temp table recipe (svc text, item text, qty numeric) on commit drop;
  insert into recipe values
    ('Potong Rambut', 'Neck strip', 1), ('Potong Rambut', 'Pisau cukur', 1), ('Potong Rambut', 'Bedak leher', 1), ('Potong Rambut', 'Clay Gatsby', 1),
    ('Essential Cut', 'Neck strip', 1), ('Essential Cut', 'Pisau cukur', 1), ('Essential Cut', 'Bedak leher', 1), ('Essential Cut', 'Clay Gatsby', 1),
    ('Kids Cut', 'Neck strip', 1), ('Kids Cut', 'Bedak leher', 1),
    ('Fresh Groom', 'Neck strip', 1), ('Fresh Groom', 'Pisau cukur', 1), ('Fresh Groom', 'Bedak leher', 1), ('Fresh Groom', 'Clay Gatsby', 2),
    ('Fresh Groom', 'Sampo', 15), ('Fresh Groom', 'Tonik rambut', 3),
    ('Relax Groom', 'Neck strip', 1), ('Relax Groom', 'Pisau cukur', 1), ('Relax Groom', 'Bedak leher', 1), ('Relax Groom', 'Clay Gatsby', 2),
    ('Relax Groom', 'Sampo', 15), ('Relax Groom', 'Tonik rambut', 3), ('Relax Groom', 'Krim creambath', 10),
    ('Signature Groom', 'Neck strip', 1), ('Signature Groom', 'Pisau cukur', 2), ('Signature Groom', 'Bedak leher', 1), ('Signature Groom', 'Clay Gatsby', 2),
    ('Signature Groom', 'Sampo', 15), ('Signature Groom', 'Tonik rambut', 3), ('Signature Groom', 'Krim creambath', 10),
    ('Signature Groom', 'Masker wajah', 10), ('Signature Groom', 'Busa cukur', 5),
    ('Cukur Jenggot', 'Neck strip', 1), ('Cukur Jenggot', 'Busa cukur', 5), ('Cukur Jenggot', 'Pisau cukur', 1),
    ('Hot towel shave', 'Busa cukur', 5), ('Hot towel shave', 'Pisau cukur', 1),
    ('Hair tonic & scalp treatment', 'Tonik rambut', 5),
    ('Face mask', 'Masker wajah', 10),
    ('Black Coloring', 'Pewarna rambut hitam', 1), ('Black Coloring', 'Oksidan 20 vol', 60), ('Black Coloring', 'Sarung tangan', 1), ('Black Coloring', 'Sampo', 20),
    ('Hair Light', 'Bubuk bleaching', 20), ('Hair Light', 'Oksidan 40 vol', 40), ('Hair Light', 'Sarung tangan', 1), ('Hair Light', 'Sampo', 20),
    ('Hair Coloring', 'Bubuk bleaching', 30), ('Hair Coloring', 'Oksidan 40 vol', 60), ('Hair Coloring', 'Pewarna rambut hitam', 1),
    ('Hair Coloring', 'Sarung tangan', 1), ('Hair Coloring', 'Sampo', 20),
    ('Perming', 'Obat keriting & penetral', 1), ('Perming', 'Sampo', 20),
    -- pijat: terapis — 1 kg krim untuk 25–30 orang, belanja krim 5 kg : minyak 1 L → ±36 g krim + ±7 ml minyak per pijat badan
    ('Pijat Fullbody', 'Krim pijat Anjelina', 36), ('Pijat Fullbody', 'Minyak pijat Anjelina', 7), ('Pijat Fullbody', 'Alas pijat / tisu', 1),
    ('Pijat Keluhan', 'Krim pijat Anjelina', 36), ('Pijat Keluhan', 'Minyak pijat Anjelina', 7), ('Pijat Keluhan', 'Alas pijat / tisu', 1),
    ('Pijat Fullbody + Kop', 'Krim pijat Anjelina', 36), ('Pijat Fullbody + Kop', 'Minyak pijat Anjelina', 7), ('Pijat Fullbody + Kop', 'Alas pijat / tisu', 1),
    ('Pijat Fullbody + Refleksi', 'Krim pijat Anjelina', 54), ('Pijat Fullbody + Refleksi', 'Minyak pijat Anjelina', 7), ('Pijat Fullbody + Refleksi', 'Alas pijat / tisu', 1),
    ('Refleksi', 'Krim pijat Anjelina', 18), ('Refleksi', 'Minyak pijat Anjelina', 3.5), ('Refleksi', 'Alas pijat / tisu', 1),
    ('Bekam (13 titik)', 'Lanset bekam', 13), ('Bekam (13 titik)', 'Alas pijat / tisu', 1),
    ('Tambahan 1 titik bekam', 'Lanset bekam', 1),
    ('Paket Bekam + Pijat + Refleksi', 'Lanset bekam', 13), ('Paket Bekam + Pijat + Refleksi', 'Krim pijat Anjelina', 54),
    ('Paket Bekam + Pijat + Refleksi', 'Minyak pijat Anjelina', 7), ('Paket Bekam + Pijat + Refleksi', 'Alas pijat / tisu', 1),
    ('Ear Candle', 'Lilin ear candle', 2),
    ('Tambah waktu pijat 30 menit', 'Krim pijat Anjelina', 18), ('Tambah waktu pijat 30 menit', 'Minyak pijat Anjelina', 3.5),
    ('Tambah waktu pijat 60 menit', 'Krim pijat Anjelina', 36), ('Tambah waktu pijat 60 menit', 'Minyak pijat Anjelina', 7);

  select string_agg(distinct r.item, ', ') into missing from recipe r
  where not exists (select 1 from inventory_items i where i.name = r.item and i.kind = 'consumable' and i.active);
  if missing is not null then raise exception 'Bahan resep tidak ditemukan: %', missing; end if;

  for s in select distinct sv.id, sv.name from recipe r join services sv on sv.name = r.svc and sv.category <> 'retail' loop
    select coalesce(jsonb_agg(jsonb_build_object('item_id', sm.item_id, 'name', i.name, 'qty', sm.qty, 'unit', i.unit) order by i.name), '[]')
      into b from service_materials sm join inventory_items i on i.id = sm.item_id where sm.service_id = s.id;
    delete from service_materials where service_id = s.id;
    insert into service_materials (service_id, item_id, qty)
      select s.id, i.id, r.qty from recipe r join inventory_items i on i.name = r.item and i.kind = 'consumable' and i.active where r.svc = s.name;
    select coalesce(jsonb_agg(jsonb_build_object('item_id', sm.item_id, 'name', i.name, 'qty', sm.qty, 'unit', i.unit) order by i.name), '[]')
      into a from service_materials sm join inventory_items i on i.id = sm.item_id where sm.service_id = s.id;
    if a is distinct from b then insert into recipe_changes (service_id, before, after) values (s.id, b, a); end if;
  end loop;
end $$;
