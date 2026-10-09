begin;
\ir helpers.psql
select plan(8);

-- Promo booking online 10%: hanya layanan dari booking yang DIBUAT online dalam periode promo; tidak ditumpuk dengan paket.
select tests.su();
update settings set online_promo_pct = 10, online_promo_start = jkt_today() - 1, online_promo_end = jkt_today() + 7;
insert into customers (id, name) values ('00000000-0000-0000-00ab-000000000001', 'Promo Online'), ('00000000-0000-0000-00ab-000000000002', 'Walk-in Biasa'),
                                        ('00000000-0000-0000-00ab-000000000003', 'Online Lama');
insert into appointments (id, customer_id, resource_id, staff_id, start_at, duration_min, source, status, created_at) values
  ('00000000-0000-0000-00ab-0000000000a1', '00000000-0000-0000-00ab-000000000001', (select id from resources where name = 'Kursi Barber 1'),
   tests.staff_andi(), jkt(jkt_today(), '10:00'), 30, 'online', 'completed', now()),
  ('00000000-0000-0000-00ab-0000000000a2', '00000000-0000-0000-00ab-000000000002', (select id from resources where name = 'Kursi Barber 2'),
   tests.staff_andi(), jkt(jkt_today(), '11:00'), 30, 'walk_in', 'completed', now()),
  ('00000000-0000-0000-00ab-0000000000a3', '00000000-0000-0000-00ab-000000000003', (select id from resources where name = 'Kursi Barber 1'),
   tests.staff_andi(), jkt(jkt_today(), '12:00'), 30, 'online', 'completed', now() - interval '10 days');

select tests.login(tests.kasir());
-- booking online dalam periode: Potong Rambut 75.000 → diskon 7.500; pomade (ritel) tidak ikut
select checkout(jsonb_build_object('method', 'cash', 'cash_received', 500000, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', '00000000-0000-0000-00ab-0000000000a1'),
  jsonb_build_object('service_id', tests.svc('Pomade Matte'))))) as tx1 \gset
select results_eq(format($$ select discount_amount, discount_label from transactions where id = '%s' $$, :'tx1'),
                  $$ values (7500::bigint, 'Promo booking online 10%'::text) $$, 'booking online dalam periode: diskon 10% dari layanan');
select is((select discount_share from transaction_items where transaction_id = :'tx1'::uuid and category = 'retail'), 0::bigint,
          'produk ritel yang ditambah di kasir tidak ikut promo');

-- walk-in: tanpa promo
select checkout(jsonb_build_object('method', 'cash', 'cash_received', 500000, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', '00000000-0000-0000-00ab-0000000000a2')))) as tx2 \gset
select is((select discount_amount from transactions where id = :'tx2'::uuid), 0::bigint, 'walk-in tidak dapat promo booking online');

-- dibuat online sebelum periode promo: tanpa promo
select checkout(jsonb_build_object('method', 'cash', 'cash_received', 500000, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', '00000000-0000-0000-00ab-0000000000a3')))) as tx3 \gset
select is((select discount_amount from transactions where id = :'tx3'::uuid), 0::bigint, 'booking online yang dibuat sebelum periode tidak dapat promo');

-- tidak ditumpuk: paket 10% (barber + nail) vs promo 10% hanya dari barber → yang lebih besar (paket)
select tests.su();
insert into appointments (id, customer_id, resource_id, staff_id, start_at, duration_min, source, status) values
  ('00000000-0000-0000-00ab-0000000000a4', '00000000-0000-0000-00ab-000000000001', (select id from resources where name = 'Kursi Barber 2'),
   tests.staff_andi(), jkt(jkt_today(), '14:00'), 30, 'online', 'completed');
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'cash_received', 500000, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', '00000000-0000-0000-00ab-0000000000a4'),
  jsonb_build_object('service_id', tests.svc('Gel Polish Tangan'), 'staff_id', tests.staff_sari())))) as tx4 \gset
select is((select discount_label from transactions where id = :'tx4'::uuid), 'Diskon paket 10%', 'promo tidak ditumpuk dengan paket: pakai yang lebih besar');

-- promo mati (0%) → tanpa diskon
select tests.su();
update settings set online_promo_pct = 0;
insert into appointments (id, customer_id, resource_id, staff_id, start_at, duration_min, source, status) values
  ('00000000-0000-0000-00ab-0000000000a5', '00000000-0000-0000-00ab-000000000001', (select id from resources where name = 'Kursi Barber 1'),
   tests.staff_andi(), jkt(jkt_today(), '16:00'), 30, 'online', 'completed');
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'cash_received', 500000, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', '00000000-0000-0000-00ab-0000000000a5')))) as tx5 \gset
select is((select discount_amount from transactions where id = :'tx5'::uuid), 0::bigint, 'promo 0% = mati');

select tests.su();
select throws_ok($$ update settings set online_promo_pct = 10, online_promo_start = null $$, '23514', null, 'promo aktif wajib punya periode');
select tests.login(tests.mgr());
select is((owner_report(jkt_today(), jkt_today(), jkt_today() - 1, jkt_today() - 1, jkt_today() - 365, jkt_today() - 365) #>> '{finance,discount_promo}')::bigint, 7500::bigint, 'laporan owner: biaya promo terpisah');

select * from finish();
rollback;
