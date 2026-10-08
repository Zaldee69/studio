begin;
\ir helpers.psql
select plan(6);

-- pelanggan yang dilayani Andi (punya catatan potongan) & pelanggan yang tidak pernah dilayani Andi
select tests.su();
insert into customers (id, name) values ('00000000-0000-0000-00fd-000000000001', 'Dilayani Andi'), ('00000000-0000-0000-00fd-000000000002', 'Bukan pelanggan Andi');
insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source)
values ('00000000-0000-0000-00fd-000000000001', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt(jkt_today() - 20, '10:00'), 30, 'admin');
insert into hair_cut_records (customer_id, style_name, notes) values
  ('00000000-0000-0000-00fd-000000000001', 'Textured Crop', 'guard 1'),
  ('00000000-0000-0000-00fd-000000000002', 'Buzz Cut', 'guard 2');

select tests.login(tests.andi());
select is((select count(*) from hair_cut_records where customer_id = '00000000-0000-0000-00fd-000000000001'), 1::bigint, 'kapster melihat riwayat pelanggan yang pernah ia layani');
select is((select count(*) from hair_cut_records where customer_id = '00000000-0000-0000-00fd-000000000002'), 0::bigint, 'kapster tidak melihat riwayat pelanggan lain');
select throws_like($$ insert into hair_cut_records (customer_id, style_name) values ('00000000-0000-0000-00fd-000000000001', 'X') $$,
                   '%row-level security%', 'catatan hanya lewat server (validasi booking & persetujuan pratinjau)');
select tests.login(tests.kasir());
select is((select count(*) from hair_cut_records where customer_id::text like '00000000-0000-0000-00fd-%'), 2::bigint, 'kasir melihat semua riwayat');
delete from hair_cut_records where customer_id = '00000000-0000-0000-00fd-000000000001';
select tests.su();
select is((select count(*) from hair_cut_records where customer_id = '00000000-0000-0000-00fd-000000000001'), 1::bigint, 'kasir tidak bisa menghapus riwayat');
select tests.login(tests.mgr());
select lives_ok($$ delete from hair_cut_records where customer_id = '00000000-0000-0000-00fd-000000000002' $$, 'manajer boleh menghapus (permintaan pelanggan)');

select * from finish();
rollback;
