begin;
\ir helpers.psql
select plan(61);

create table tests.v (k text primary key, v text);
grant all on tests.v to anon, authenticated;
create function tests.get(k text) returns text language sql as $$ select v from tests.v where tests.v.k = $1 $$;
create function tests.put(k text, v text) returns text language sql as $$
  insert into tests.v values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
create function tests.item(n text) returns uuid language sql security definer as $$ select id from public.inventory_items where name = n $$;
create function tests.dimas() returns uuid language sql immutable as $$ select '00000000-0000-0000-0001-000000000003'::uuid $$;
create function tests.maya() returns uuid language sql immutable as $$ select '00000000-0000-0000-0001-000000000005'::uuid $$;
create function tests.dewi() returns uuid language sql immutable as $$ select '00000000-0000-0000-0001-000000000006'::uuid $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Fixture: bahan & layanan contoh spesifikasi (4.1, 4.2).
insert into inventory_items (name, kind, unit, unit_cost, reorder_at) values
  ('Krim uji', 'consumable', 'ml', 120, 0), ('Base uji', 'consumable', 'ml', 1200, 0), ('Warna uji', 'consumable', 'ml', 1800, 0),
  ('Remover uji', 'consumable', 'ml', 40, 0), ('Kapas uji', 'consumable', 'pcs', 150, 0), ('Bahan X', 'consumable', 'ml', 100, 0);
insert into stock_moves (item_id, qty, type, unit_cost, note) values (tests.item('Krim uji'), 450, 'in', 120, 'awal');
insert into services (name, category, price, duration_min, sort) values ('Gel uji', 'nail', 180000, 60, 90), ('Layanan X', 'barbershop', 50000, 30, 91);

-- =============================== RLS (R1, R5) ===============================
select tests.login(tests.kasir());
select is((select count(*) from inventory_items), 0::bigint, 'R1 kasir: tabel inventory_items (unit_cost) tertutup');
select ok((select count(*) from inventory_public) > 0, 'R1 kasir: nama/satuan/stok lewat inventory_public');
select is((select count(*) from information_schema.columns where table_name = 'inventory_public' and column_name ~ 'cost|value'), 0::bigint,
          'R1 inventory_public tanpa kolom harga pokok');
select is((select count(*) from service_materials) + (select count(*) from suppliers) + (select count(*) from recipe_changes), 0::bigint,
          'R5 kasir: resep, pemasok, riwayat resep tertutup');
select throws_like($$ select receive_stock(tests.item('Krim uji'), 1, 1) $$, '%Akses ditolak%', 'kasir tidak bisa stok masuk');
select tests.login(tests.andi());
select is((select count(*) from service_materials) + (select count(*) from suppliers) + (select count(*) from recipe_changes)
          + (select count(*) from inventory_public), 0::bigint, 'R5 kapster: resep, pemasok, riwayat, inventaris tertutup');

-- =============================== 4.1 Harga pokok (U1) ===============================
select tests.login(tests.mgr());
select is((receive_stock(tests.item('Krim uji'), 1000, 135) ->> 'unit_cost')::numeric, 130.3448, 'U1 rata-rata tertimbang: (450×120 + 1000×135)/1450');
select is((select unit_cost from inventory_items where id = tests.item('Krim uji')), 130.3448::numeric(14,4), 'U1 harga pokok tersimpan 4 desimal');
select is((select qty from stock_levels where item_id = tests.item('Krim uji')), 1450::numeric, 'stok = Σ mutasi');
select is((receive_stock(tests.item('Base uji'), 10, 1300) ->> 'unit_cost')::numeric, 1300::numeric, 'U1 stok lama 0 → harga beli');
update settings set inventory_cost_method = 'last';
select is((receive_stock(tests.item('Krim uji'), 100, 140) ->> 'unit_cost')::numeric, 140::numeric, 'U1 metode harga terakhir');
update settings set inventory_cost_method = 'weighted_avg';
select throws_like($$ update inventory_items set unit_cost = 1 where name = 'Krim uji' $$, '%Harga pokok hanya berubah%', 'harga pokok tidak bisa diedit langsung');
select set_unit_cost(tests.item('Base uji'), 1200, 'salah input nota');
select is((select count(*) from cost_changes where item_id = tests.item('Base uji')), 1::bigint, 'penyesuaian harga tercatat dengan alasan');
select throws_like($$ select adjust_stock(tests.item('Krim uji'), -5, null) $$, '%alasan%', 'penyesuaian wajib alasan');
select is(adjust_stock(tests.item('Krim uji'), -5, 'tumpah'), 1545::numeric, 'penyesuaian mengurangi stok');
select throws_like($$ delete from inventory_items where name = 'Krim uji' $$, '%nonaktifkan%', 'item bermutasi tidak bisa dihapus');

-- =============================== 4.2 HPP & resep (U2, P2) ===============================
select is(save_recipe(tests.svc('Gel uji'), jsonb_build_array(
  jsonb_build_object('item_id', tests.item('Base uji'), 'qty', 3), jsonb_build_object('item_id', tests.item('Warna uji'), 'qty', 4),
  jsonb_build_object('item_id', tests.item('Remover uji'), 'qty', 15), jsonb_build_object('item_id', tests.item('Kapas uji'), 'qty', 4))),
  12000::bigint, 'U2 HPP Gel Polish = 12.000');
select results_eq($$ select margin, margin_pct, commission, contribution from service_margins where name = 'Gel uji' $$,
  $$ values (168000::bigint, 93.3::numeric, 67200::bigint, 100800::bigint) $$, 'U2 margin 168.000 (93,3%), komisi 67.200, laba 100.800');
select is((select count(*) from recipe_changes where service_id = tests.svc('Gel uji')), 1::bigint, 'riwayat resep tercatat');
select throws_like(format($$ select save_recipe('%s', '[{"item_id":"%s","qty":1}]') $$, tests.svc('Gel uji'), tests.item('Pomade Matte')),
  '%item HPP%', 'resep hanya dari bahan HPP');
select save_recipe(tests.svc('Layanan X'), jsonb_build_array(jsonb_build_object('item_id', tests.item('Bahan X'), 'qty', 15)));

-- =============================== Checkout: komisi (U4, U6) ===============================
select tests.login(tests.kasir());
select tests.put('tx_bundle', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Gel Polish Tangan'), 'staff_id', tests.staff_sari()))))::text);
select tests.put('tx_retail', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Pomade Matte'), 'staff_id', tests.maya()),
  jsonb_build_object('service_id', tests.svc('Cuticle Oil'))))) ::text);
select tests.put('tx_upsell', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.dimas()),
  jsonb_build_object('service_id', tests.svc('Hair Spa'), 'staff_id', tests.dimas(), 'from_upsell', true))))::text);
select is((select count(*) from transaction_items where transaction_id = tests.get('tx_upsell')::uuid and from_upsell), 1::bigint, 'from_upsell tersimpan');
select is((select staff_id from transaction_items where transaction_id = tests.get('tx_retail')::uuid and name = 'Pomade Matte'), tests.maya(),
          'staf penjual ritel tersimpan');

select tests.login(tests.mgr());
update settings set retail_commission_pct = 5;
select results_eq(format($$ select net_amount, commission from commission_items(jkt_today(), '%s') where transaction_id = '%s' $$,
  tests.staff_andi(), tests.get('tx_bundle')), $$ values (67500::bigint, 26480::bigint) $$,
  'U4 Andi: net 67.500 (diskon 7.500) → (67.500 − HPP 1.300) × 40%');
select results_eq(format($$ select net_amount, hpp, commission from commission_items(jkt_today(), '%s') where transaction_id = '%s' $$,
  tests.staff_sari(), tests.get('tx_bundle')), $$ values (162000::bigint, 12000::bigint, 60000::bigint) $$,
  'U4 Sari: net 162.000 (diskon 18.000) → (162.000 − 12.000) × 40% = 60.000');
update staff set commission_pct_override = 45 where id = tests.staff_sari();
select is((select commission from commission_items(jkt_today(), tests.staff_sari()) where transaction_id = tests.get('tx_bundle')::uuid),
          67500::bigint, 'U4 override staf 45%');
update staff set commission_pct_override = null where id = tests.staff_sari();
select is((select commission from commission_items(jkt_today(), tests.maya()) where transaction_id = tests.get('tx_retail')::uuid),
          5500::bigint, 'U6 komisi ritel 5% Pomade 110.000 = 5.500');
select tests.su();
select is((select count(*) from transaction_items ti join commission_lines(jkt_today()) l on l.transaction_item_id = ti.id
           where ti.transaction_id = tests.get('tx_retail')::uuid and ti.name = 'Cuticle Oil'), 0::bigint, 'U6 ritel tanpa penjual → tanpa komisi');
select tests.login(tests.mgr());

-- Jaring pengaman (U5): subsidi dihitung sebelum penyesuaian.
select tests.put('dewi0', (select row(commission_service + commission_retail, subsidy, total_pay)::text from commission_for_period(jkt_today(), tests.dewi())));
select payroll_add_adjustment(tests.dewi(), jkt_today(), 'bonus', 100000, 'Target tercapai');
select results_eq(format($$ select row(commission_service + commission_retail, subsidy, total_pay - 100000)::text from commission_for_period(jkt_today(), '%s') $$, tests.dewi()),
  format($$ values ('%s'::text) $$, tests.get('dewi0')), 'U5 bonus tidak mengurangi subsidi');
select payroll_add_adjustment(tests.dewi(), jkt_today(), 'deduction', 30000, 'Terlambat');
select is((select adjustments from commission_for_period(jkt_today(), tests.dewi())), 70000::bigint, 'U5 potongan tercatat negatif, subsidi tidak bertambah');
select throws_like(format($$ select payroll_add_adjustment('%s', jkt_today(), 'bonus', 1, '  ') $$, tests.dewi()), '%Alasan%', 'penyesuaian wajib alasan');

-- =============================== RLS komisi (R3) ===============================
select tests.login(tests.andi());
select is((select count(*) from commission_items(jkt_today(), tests.staff_sari()) where transaction_id = tests.get('tx_bundle')::uuid and name <> 'Potong Rambut'),
          0::bigint, 'R3 kapster meminta rincian Sari → hanya dirinya');
select is((select count(*) from commission_items(jkt_today()) where hpp is not null), 0::bigint, 'R3 rincian kapster tanpa HPP');
select is((select count(*) from commission_for_period(jkt_today()) where hpp_total is not null), 0::bigint, 'R3 ringkasan kapster tanpa HPP');

-- =============================== Notifikasi reorder ===============================
select tests.su();
update inventory_items set reorder_at = (select qty from stock_levels where name = 'Neck strip') - 1 where name = 'Neck strip';
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()))));
select is((select count(*) from notifications), 0::bigint, 'kasir tidak melihat notifikasi manajer');
select tests.login(tests.mgr());
select is((select count(*) from notifications where kind = 'low_stock' and read_at is null and payload ->> 'name' = 'Neck strip'), 1::bigint,
          'neck strip melewati ambang → 1 notifikasi');
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()))));
select tests.login(tests.mgr());
select is((select count(*) from notifications where kind = 'low_stock' and payload ->> 'name' = 'Neck strip'), 1::bigint, 'tidak dobel selama belum dibaca');
select ok(exists (select 1 from shopping_list() where name = 'Neck strip' and suggested > 0), 'daftar belanja memuat neck strip');
select receive_stock(tests.item('Neck strip'), 200, 300);
select is((select count(*) from notifications where kind = 'low_stock' and read_at is null and payload ->> 'name' = 'Neck strip'), 0::bigint,
          'stok masuk menandai notifikasi terbaca');

-- =============================== Opname (U7, R2) ===============================
select tests.login(tests.kasir());
select tests.put('o1', opname_start('consumable')::text);
select throws_like($$ select opname_start('consumable') $$, '%opname draft%', 'hanya satu draft per cakupan');
select is((select count(*) from stock_opname_lines), 0::bigint, 'kasir tidak membaca baris opname (harga pokok)');
select ok((select count(*) from opname_sheet where opname_id = tests.get('o1')::uuid) > 0, 'kasir membaca lembar hitung');
select tests.put('neck0', (select system_qty::text from opname_sheet where opname_id = tests.get('o1')::uuid and name = 'Neck strip'));
select opname_save_counts(tests.get('o1')::uuid, jsonb_build_array(
  jsonb_build_object('item_id', tests.item('Neck strip'), 'counted_qty', tests.get('neck0')::numeric - 3),
  jsonb_build_object('item_id', tests.item('Bahan X'), 'counted_qty', 0)));
select throws_like(format($$ select opname_approve('%s') $$, tests.get('o1')), '%Akses ditolak%', 'R2 kasir tidak bisa menyetujui');
select tests.login(tests.mgr());
select opname_save_counts(tests.get('o1')::uuid, jsonb_build_array(jsonb_build_object('item_id', tests.item('Bahan X'), 'counted_qty', 1000)));
select tests.su();
-- Bahan X: stok awal 1000 sebelum opname 1 (dibuat mundur agar jendela laporan jelas).
alter table stock_moves disable trigger stock_moves_immutable;
insert into stock_moves (item_id, qty, type, unit_cost, note, created_at) values (tests.item('Bahan X'), 1000, 'in', 100, 'awal', now() - interval '3 hours');
update stock_opname_lines set system_qty = 1000 where opname_id = tests.get('o1')::uuid and item_id = tests.item('Bahan X');
select tests.login(tests.mgr());
select results_eq(format($$ select (opname_approve('%s') ->> 'value')::bigint $$, tests.get('o1')), $$ values (-900::bigint) $$,
  'U7 neck strip −3 @300 = −Rp900');
select is((select qty from stock_levels where name = 'Neck strip'), tests.get('neck0')::numeric - 3, 'U7 stok = hitungan fisik');
select is((select count(*) from stock_moves where opname_id = tests.get('o1')::uuid), 1::bigint, 'U7 hanya diff ≠ 0 yang jadi mutasi; hitungan kosong dilewati');
select throws_like(format($$ select opname_save_counts('%s', '[]') $$, tests.get('o1')), '%dikunci%', 'opname disetujui terkunci');

-- =============================== 4.5 Teoretis vs aktual (U8) ===============================
select tests.su();
update stock_opnames set started_at = now() - interval '2 hours' where id = tests.get('o1')::uuid;
update stock_moves set created_at = now() - interval '2 hours' where opname_id = tests.get('o1')::uuid;
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Layanan X'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Layanan X'), 'staff_id', tests.staff_andi()))));
select tests.login(tests.mgr());
select receive_stock(tests.item('Bahan X'), 500, 100);
select adjust_stock(tests.item('Bahan X'), -10, 'tumpah');
select tests.put('o2', opname_start('consumable')::text);
select opname_save_counts(tests.get('o2')::uuid, jsonb_build_array(jsonb_build_object('item_id', tests.item('Bahan X'), 'counted_qty', 1440)));
select opname_approve(tests.get('o2')::uuid);
select tests.su();
update stock_opnames set started_at = now() + interval '1 minute' where id = tests.get('o2')::uuid;
select tests.login(tests.mgr());
select results_eq(format($$ select theoretical, actual, variance, variance_pct, flagged from usage_report('%s', '%s') where name = 'Bahan X' $$,
  tests.get('o1'), tests.get('o2')), $$ values (30::numeric, 50::numeric, 20::numeric, 66.7::numeric, true) $$,
  'U8 teoretis 30 (2×15), aktual 1000+500−10−1440 = 50 → +66,7% ditandai');

-- =============================== Evaluasi tahunan (U11) ===============================
select tests.su();
alter table transactions disable trigger transactions_immutable;
insert into customers (name, whatsapp) values ('Balik 60', '6281200000060'), ('Balik 61', '6281200000061');
do $$
declare c60 uuid := (select id from customers where name = 'Balik 60'); c61 uuid := (select id from customers where name = 'Balik 61');
        v record; tx uuid;
begin
  for v in select * from (values (c60, date '2025-03-01', false), (c60, date '2025-04-30', true), (c61, date '2025-03-01', false), (c61, date '2025-05-01', false)) x(c, d, up) loop
    insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
    values (v.c, 75000, 75000, 75000, 'cash', jkt(v.d, '10:00')) returning id into tx;
    insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount, from_upsell)
    values (tx, tests.dimas(), 'Potong Rambut', 'barbershop', 75000, 75000, v.up);
  end loop;
end $$;
insert into staff_time_off (staff_id, start_at, end_at, status, reason)
values (tests.dimas(), jkt('2025-06-02', '00:00'), jkt('2025-06-04', '00:00'), 'approved', 'cuti');
select tests.login(tests.mgr());
select results_eq($$ select revenue_net, service_count, avg_per_service, upsell_rate, return_rate, work_days, off_days
                     from staff_annual_review(2025) where staff_id = tests.dimas() $$,
  $$ values (300000::bigint, 4, 75000::bigint, 25.0::numeric, 50.0::numeric, 3, 2) $$,
  'U11 upsell 1/4, kembali ≤60 hari: tepat 60 ya, 61 tidak → 50%; hari kerja 3; izin 2 hari');
select is((select rank from staff_leaderboard('2025-01-01', '2025-12-31') where staff_id = tests.dimas()), 1, 'peringkat 2025: Dimas #1');

-- =============================== Tutup periode (U9, U10, R4, P5) ===============================
select tests.put('before', (select string_agg(staff_id || ':' || commission_service || ':' || total_pay, ',' order by staff_id) from commission_for_period(jkt_today())));
select ok(payroll_close(jkt_today()) >= 6, 'payroll_close menulis snapshot per staf');
update settings set commission_pct = 50;
select save_recipe(tests.svc('Gel Polish Tangan'), '[]');
select is((select string_agg(staff_id || ':' || commission_service || ':' || total_pay, ',' order by staff_id) from commission_for_period(jkt_today())), tests.get('before'),
          'U10 periode tertutup: ubah rasio & resep tidak mengubah angka');
select is((select bool_and(closed) from commission_for_period(jkt_today())), true, 'periode ditandai final');
select throws_like(format($$ select void_transaction('%s', 'salah') $$, tests.get('tx_bundle')), '%sudah ditutup. Buka ulang dulu%', 'U9 void ditolak di periode tertutup');
select throws_like(format($$ select payroll_add_adjustment('%s', jkt_today(), 'bonus', 1, 'x') $$, tests.dewi()), '%sudah ditutup%', 'penyesuaian ditolak di periode tertutup');
select payroll_mark_paid(jkt_today(), tests.dewi(), 'transfer');
select is((select paid_method from commission_for_period(jkt_today(), tests.dewi())), 'transfer', 'tandai dibayar');
select tests.login(tests.andi());
select is((select count(*) from payroll_snapshots where staff_id <> tests.staff_andi()), 0::bigint, 'R4 kapster tidak membaca snapshot staf lain');
select is((select count(*) from payroll_snapshots), 1::bigint, 'R4 kapster membaca snapshot miliknya');
select is((select count(*) from notifications where kind = 'payroll_ready'), 1::bigint, 'kapster mendapat notifikasi slip final');
select tests.login(tests.mgr());
select throws_like($$ select payroll_reopen(jkt_today(), '') $$, '%Alasan%', 'buka ulang wajib alasan');
select payroll_reopen(jkt_today(), 'koreksi transaksi');
select void_transaction(tests.get('tx_bundle')::uuid, 'salah input');
select is((select count(*) from commission_items(jkt_today(), tests.staff_sari()) where transaction_id = tests.get('tx_bundle')::uuid), 0::bigint,
          'U9 transaksi void diabaikan di komisi');
select isnt((select string_agg(staff_id || ':' || commission_service || ':' || total_pay, ',' order by staff_id) from commission_for_period(jkt_today())), tests.get('before'),
            'setelah buka ulang angka dihitung ulang');

select * from finish();
rollback;
