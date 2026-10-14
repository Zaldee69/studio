begin;
\ir helpers.psql
select plan(12);

-- Voucher booking online: dicek saat booking, dipotong saat bayar; tidak ditumpuk (pakai yang terbesar).
select tests.su();
update settings set online_promo_pct = 0;
insert into vouchers (code, kind, value, category, min_spend, quota, once_per_customer, starts_on, ends_on) values
  ('HEMAT20', 'pct', 20, 'barbershop', 0, 2, true, jkt_today() - 1, jkt_today() + 7),
  ('MIN500', 'amount', 50000, null, 500000, null, false, null, null),
  ('LEWAT', 'pct', 10, null, 0, null, false, jkt_today() - 10, jkt_today() - 1);
select tests.svc('Potong Rambut') as potong, tests.svc('Manicure Basic') as mani \gset

select is((voucher_check('hemat20', array[:'potong'::uuid]) ->> 'ok')::boolean, true, 'kode tidak peka huruf besar/kecil');
select is((voucher_check('HEMAT20', array[:'mani'::uuid]) ->> 'message'), 'Voucher tidak berlaku untuk layanan yang dipilih', 'kategori dibatasi');
select ok((voucher_check('MIN500', array[:'potong'::uuid]) ->> 'message') like 'Voucher berlaku untuk minimal belanja%', 'minimal belanja');
select is(voucher_check('LEWAT', array[:'potong'::uuid]) ->> 'message', 'Voucher sedang tidak berlaku', 'di luar periode');
select is(voucher_check('ASAL', array[:'potong'::uuid]) ->> 'message', 'Kode voucher tidak dikenal', 'kode tidak dikenal');

-- booking online dengan kode salah ditolak sebelum slot dipesan
select is(book_online(jsonb_build_object('date', jkt_today() + 1, 'time', '10:00', 'service_ids', jsonb_build_array(:'potong'),
  'together', true, 'name', 'Uji Voucher', 'whatsapp', '081299990001', 'voucher_code', 'ASAL', 'client_request_id', 'vch-test-0001')) ->> 'code',
  'voucher', 'booking dengan voucher salah ditolak');

-- booking ber-voucher (dibuat langsung) → kasir memotong 20% dari Potong Rambut
insert into customers (id, name, whatsapp) values ('00000000-0000-0000-00ee-000000000001', 'Pemakai Voucher', '6281299990002');
insert into booking_groups (id, code, customer_id, source, voucher_id) values
  ('00000000-0000-0000-00ee-0000000000b1', 'VCHT01', '00000000-0000-0000-00ee-000000000001', 'online', (select id from vouchers where code = 'HEMAT20'));
insert into appointments (id, customer_id, resource_id, staff_id, start_at, duration_min, source, status, booking_group_id) values
  ('00000000-0000-0000-00ee-0000000000a1', '00000000-0000-0000-00ee-000000000001', (select id from resources where name = 'Kursi Barber 1'),
   tests.staff_andi(), jkt(jkt_today(), '08:00'), 30, 'online', 'completed', '00000000-0000-0000-00ee-0000000000b1');
select is((voucher_check('HEMAT20', array[:'potong'::uuid], '00000000-0000-0000-00ee-000000000001') ->> 'message'),
  'Voucher ini sudah pernah dipakai dengan nomor ini', 'sekali per pelanggan');

select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', :'potong', 'appointment_id', '00000000-0000-0000-00ee-0000000000a1')))) as tx \gset
select tests.su();
select results_eq(format($$ select discount_amount, discount_label, voucher_id = (select id from vouchers where code = 'HEMAT20') from transactions where id = '%s' $$, :'tx'),
  format($$ values (round((select price from services where id = '%s') * 20 / 10000.0)::bigint * 100, 'Voucher HEMAT20'::text, true) $$, :'potong'),
  'kasir memotong voucher & mencatat voucher di transaksi');

-- kuota 2: satu sudah terpakai (booking di atas) + satu lagi → habis
insert into customers (id, name, whatsapp) values ('00000000-0000-0000-00ee-000000000002', 'Kedua', '6281299990003');
insert into booking_groups (id, code, customer_id, source, voucher_id) values
  ('00000000-0000-0000-00ee-0000000000b2', 'VCHT02', '00000000-0000-0000-00ee-000000000002', 'online', (select id from vouchers where code = 'HEMAT20'));
insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status, booking_group_id) values
  ('00000000-0000-0000-00ee-000000000002', (select id from resources where name = 'Kursi Barber 2'), tests.staff_andi(),
   jkt(jkt_today() + 1, '08:00'), 30, 'online', 'booked', '00000000-0000-0000-00ee-0000000000b2');
select is(voucher_check('HEMAT20', array[:'potong'::uuid]) ->> 'message', 'Kuota voucher sudah habis', 'kuota habis');
update appointments set status = 'cancelled', cancel_reason = 'uji' where booking_group_id = '00000000-0000-0000-00ee-0000000000b2';
select is((voucher_check('HEMAT20', array[:'potong'::uuid]) ->> 'ok')::boolean, true, 'booking dibatalkan → kuota kembali');

-- tidak ditumpuk: voucher nominal kecil vs diskon paket (barbershop + nail) → dipakai diskon paket
insert into vouchers (code, kind, value) values ('KECIL', 'amount', 1000);
insert into booking_groups (id, code, customer_id, source, voucher_id) values
  ('00000000-0000-0000-00ee-0000000000b3', 'VCHT03', '00000000-0000-0000-00ee-000000000002', 'online', (select id from vouchers where code = 'KECIL'));
insert into appointments (id, customer_id, resource_id, staff_id, start_at, duration_min, source, status, booking_group_id) values
  ('00000000-0000-0000-00ee-0000000000a3', '00000000-0000-0000-00ee-000000000002', (select id from resources where name = 'Kursi Barber 2'),
   tests.staff_andi(), jkt(jkt_today(), '08:30'), 30, 'online', 'completed', '00000000-0000-0000-00ee-0000000000b3');
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', :'potong', 'appointment_id', '00000000-0000-0000-00ee-0000000000a3'),
  jsonb_build_object('service_id', :'mani', 'staff_id', tests.staff_sari())))) as tx3 \gset
select tests.su();
select results_eq(format($$ select discount_label like 'Diskon paket%%', voucher_id is null from transactions where id = '%s' $$, :'tx3'),
  $$ values (true, true) $$, 'tidak ditumpuk: diskon paket lebih besar dipakai, voucher tidak tercatat');

select tests.login(tests.mgr());
select is((select count(*) from voucher_usage() where reserved >= 1 and redeemed = 1), 1::bigint, 'pemakaian voucher tercatat');

select * from finish();
rollback;
