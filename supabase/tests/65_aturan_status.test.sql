begin;
\ir helpers.psql
select plan(6);

-- Audit BOOK-5 (1 Nov): status maju/mundur satu langkah; tidak lompat ke Selesai; Tidak datang hanya booking yang belum datang.
select tests.su();
insert into appointments (id, resource_id, staff_id, start_at, duration_min, source, status, guest_name) values
  ('00000000-0000-0000-00f9-000000000001', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-06-03', '10:00'), 30, 'admin', 'booked', 'Uji Status'),
  ('00000000-0000-0000-00f9-000000000002', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), now() - interval '2 hours', 30, 'admin', 'arrived', 'Uji Datang');

select tests.login(tests.kasir());
select throws_like($$ select set_appointment_status('00000000-0000-0000-00f9-000000000001', 'completed') $$, '%tidak bisa langsung%', 'Terjadwal → Selesai ditolak');
select lives_ok($$ select set_appointment_status('00000000-0000-0000-00f9-000000000001', 'in_service') $$, 'Terjadwal → Dilayani boleh');
select lives_ok($$ select set_appointment_status('00000000-0000-0000-00f9-000000000001', 'completed') $$, 'Dilayani → Selesai boleh');
select tests.su();
select ok((select service_started_at is not null and service_ended_at is not null from appointments where id = '00000000-0000-0000-00f9-000000000001'),
  'jam layanan tercatat');
select tests.login(tests.kasir());
select throws_like($$ select mark_no_show('00000000-0000-0000-00f9-000000000002') $$, '%belum datang%', 'pelanggan yang sudah datang tidak bisa ditandai tidak datang');
select tests.su();
update appointments set status = 'no_show' where id = '00000000-0000-0000-00f9-000000000002';
select tests.login(tests.kasir());
select throws_like($$ select set_appointment_status('00000000-0000-0000-00f9-000000000002', 'booked') $$, '%hanya manajer%', 'kasir tidak bisa menghidupkan "tidak datang"');

select * from finish();
rollback;
