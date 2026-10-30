begin;
\ir helpers.psql
select plan(5);

-- Maks. potongan voucher (30 Okt): voucher persen dibatasi nominal; kosong = tanpa batas.
select tests.su();
update settings set online_promo_pct = 0;
insert into vouchers (code, kind, value, category, max_discount, once_per_customer) values
  ('MAKS10', 'pct', 50, 'barbershop', 10000, false),
  ('TANPAMAKS', 'pct', 50, 'barbershop', null, false);
select tests.svc('Potong Rambut') as potong \gset

select is((voucher_check('MAKS10', array[:'potong'::uuid]) ->> 'discount')::bigint, 10000::bigint, 'potongan persen dibatasi maks.');
select is(voucher_check('MAKS10', array[:'potong'::uuid]) ->> 'label', '50% (maks. Rp10.000)', 'label menyebut batasnya');
select is((voucher_check('TANPAMAKS', array[:'potong'::uuid]) ->> 'discount')::bigint,
  (select round(price * 50 / 10000.0)::bigint * 100 from services where id = :'potong'), 'tanpa maks. → persen penuh');
select throws_ok($$ update vouchers set max_discount = 0 where code = 'MAKS10' $$, '23514', null, 'maks. potongan harus > 0');

-- booking ber-voucher → kasir memotong sampai batas
insert into customers (id, name, whatsapp) values ('00000000-0000-0000-00f2-000000000001', 'Uji Maks', '6281299992001');
insert into booking_groups (id, code, customer_id, source, voucher_id) values
  ('00000000-0000-0000-00f2-0000000000b1', 'MAKS01', '00000000-0000-0000-00f2-000000000001', 'online', (select id from vouchers where code = 'MAKS10'));
insert into appointments (id, customer_id, resource_id, staff_id, start_at, duration_min, source, status, booking_group_id) values
  ('00000000-0000-0000-00f2-0000000000a1', '00000000-0000-0000-00f2-000000000001', (select id from resources where name = 'Kursi Barber 1'),
   tests.staff_andi(), jkt(jkt_today(), '08:00'), 30, 'online', 'completed', '00000000-0000-0000-00f2-0000000000b1');
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', :'potong', 'appointment_id', '00000000-0000-0000-00f2-0000000000a1')))) as tx \gset
select tests.su();
select is((select discount_amount from transactions where id = :'tx'), 10000::bigint, 'kasir memotong sampai maks.');

select * from finish();
rollback;
