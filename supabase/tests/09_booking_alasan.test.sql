begin;
\ir helpers.psql
select plan(16);

-- Alasan slot kosong (bug: tautan lama berisi id layanan terhapus → semua tanggal tampil "penuh").
create function tests.why(d date, ids uuid[], pick jsonb default '{}') returns text language sql as $$
  select booking_unavailable_reason(d, ids, pick) $$;
grant execute on all functions in schema tests to anon, authenticated;
select tests.anon();

select is(tests.why(jkt_today() + 1, array[tests.svc('Potong Rambut')]), null, 'layanan valid, hari buka → null (bila kosong berarti memang penuh)');
select is(tests.why(jkt_today() + 1, '{}'), 'services', 'tanpa layanan → services');
select is(tests.why(jkt_today() + 1, array[gen_random_uuid()]), 'services', 'id layanan lama/terhapus → services');
select is((select count(*) from get_available_slots(jkt_today() + 1, array[gen_random_uuid()])), 0::bigint, '…dan memang tanpa slot (bukan penuh)');
select is(tests.why(jkt_today() + 1, array[tests.svc('Potong Rambut')], jsonb_build_object('barbershop', gen_random_uuid())), 'staff', 'staf tidak dikenal → staff');
select is(tests.why(jkt_today() + 1, array[tests.svc('Potong Rambut')], '{"barbershop":"bukan-uuid"}'), 'staff', 'staf bukan uuid → staff (tanpa error)');
select is(tests.why(jkt_today() + 1, array[tests.svc('Potong Rambut')], jsonb_build_object('barbershop', tests.staff_sari())), 'staff', 'staf nail dipilih untuk barbershop → staff');
select is(tests.why(jkt_today() + 100, array[tests.svc('Potong Rambut')]), 'range', 'di luar jangka booking → range');
select is(tests.why(jkt_today(), array[tests.svc('Potong Rambut')]), 'today', 'hari ini kosong → today');

select tests.su();
update services set online_bookable = false where name = 'Hair Coloring';
select tests.anon();
select is(tests.why(jkt_today() + 1, array[tests.svc('Hair Coloring')]), 'services', 'layanan tidak untuk booking online → services');

select tests.su();
insert into special_closures (date, reason) values (jkt_today() + 2, 'Libur');
insert into staff_time_off (staff_id, start_at, end_at, status) values (tests.staff_andi(), jkt(jkt_today() + 3, '00:00'), jkt(jkt_today() + 4, '00:00'), 'approved');
select tests.anon();
select is(tests.why(jkt_today() + 2, array[tests.svc('Potong Rambut')]), 'day_closed', 'libur khusus → day_closed');
select is(tests.why(jkt_today() + 3, array[tests.svc('Potong Rambut')], jsonb_build_object('barbershop', tests.staff_andi())), 'staff_off', 'staf pilihan izin seharian → staff_off');

-- Tanpa meja nail aktif → kategori nail tidak ditawarkan
select tests.su();
update resources set active = false where type = 'nail';
select tests.anon();
select is((select array_agg(c order by c) from bookable_categories() c), array['barbershop'], 'tanpa meja nail aktif → hanya barbershop yang bisa dibooking');
select is(tests.why(jkt_today() + 1, array[tests.svc('Manicure Basic')]), 'capacity', 'layanan nail tanpa meja aktif → capacity');
select tests.su();
update resources set active = true where type = 'nail';
update staff set active = false where category = 'nail';
select tests.anon();
select is((select array_agg(c order by c) from bookable_categories() c), array['barbershop'], 'tanpa staf nail aktif → nail juga tidak ditawarkan');

select tests.su();
update settings set online_booking_open = false;
select tests.anon();
select is(tests.why(jkt_today() + 1, array[tests.svc('Potong Rambut')]), 'closed', 'booking online ditutup → closed');

select * from finish();
rollback;
