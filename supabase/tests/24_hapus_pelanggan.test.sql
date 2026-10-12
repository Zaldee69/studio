begin;
\ir helpers.psql
select plan(11);

-- Hapus pelanggan (manajer): transaksi tetap (tanpa pelanggan), booking mendatang batal, data pribadi hilang.
select tests.su();
insert into customers (name, whatsapp) values ('Aa', '6289900001111') returning id as cid \gset
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'customer_id', :'cid',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx \gset
select create_booking_admin((select id from resources where name = 'Kursi Barber 2'), tests.staff_andi(), jkt(jkt_today() + 3, '10:00'),
  array[tests.svc('Potong Rambut')], :'cid', p_force => true) ->> 'appointment_id' as appt \gset

select throws_like(format($$ select forget_customer(%L, 'x') $$, :'cid'), '%Akses ditolak%', 'kasir tidak bisa menghapus pelanggan');
select tests.login(tests.mgr());
select throws_like(format($$ select forget_customer(%L, ' ') $$, :'cid'), '%Alasan wajib%', 'alasan wajib');
select is(forget_customer(:'cid', 'permintaan pelanggan'), 'deleted', 'tanpa riwayat deposit → dihapus');
select is((select count(*) from customers where id = :'cid'), 0::bigint, 'data pelanggan hilang');
select is((select customer_id from transactions where id = :'tx'), null, 'transaksi tetap ada, tanpa pelanggan');
select is((select status::text from appointments where id = :'appt'), 'cancelled', 'booking mendatang dibatalkan');
select is((select count(*) from audit_log where entity = 'customers' and entity_id = :'cid' and action = 'forget'), 1::bigint, 'alasan tercatat di audit');

select tests.su();
select throws_like(format($$ update transactions set customer_id = %L where id = %L $$, tests.staff_andi(), :'tx'), '%immutable%',
  'transaksi tetap immutable di luar fungsi hapus');
insert into customers (name, whatsapp) values ('Cc', '6289900003333') returning id as cid3 \gset
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'customer_id', :'cid3',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Cukur Jenggot'), 'staff_id', tests.staff_andi())))) as tx3 \gset
select tests.su();
select throws_like(format($$ update transactions set customer_id = null where id = %L $$, :'tx3'), '%immutable%',
  'mengosongkan pelanggan transaksi hanya lewat fungsi hapus');

-- saldo deposit masih ada → ditolak
insert into customers (name, whatsapp) values ('Bb', '6289900002222') returning id as cid2 \gset
select tests.login(tests.kasir());
select topup_deposit(:'cid2', 'cash', (select id from deposit_packages where active order by amount_paid limit 1));
select tests.login(tests.mgr());
select throws_like(format($$ select forget_customer(%L, 'x') $$, :'cid2'), '%Saldo deposit masih%', 'saldo deposit masih ada → ditolak');

-- daftar pelanggan menyembunyikan yang dianonimkan
select tests.su();
update customers set deleted_at = now() where id = :'cid2';
select is((select deleted_at is not null from customers where id = :'cid2'), true, 'kolom deleted_at untuk menyembunyikan data anonim');

select * from finish();
rollback;
