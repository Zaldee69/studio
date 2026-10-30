begin;
\ir helpers.psql
select plan(10);

-- WA ke capster: nomor di data staf, booking baru/pindah/batal, rekap pagi. Trigger ditunda sampai commit →
-- di tes dipaksa langsung, dan booking + layanannya dibuat dalam satu pernyataan (seperti satu transaksi booking).
select tests.su();
set constraints appointments_notify_wa immediate;
update staff set whatsapp = '0812 5555 0001' where id = tests.staff_andi();
select is((select whatsapp from staff where id = tests.staff_andi()), '6281255550001', 'No. WA staf dinormalkan ke 62…');
select throws_ok($$ update staff set whatsapp = '12345' where id = tests.staff_andi() $$, 'No. WA staf tidak valid (contoh 0812…)');

create temp table ids (k text, id uuid);
create function pg_temp.book(k text, src appt_source, at timestamptz) returns void language sql as $f$
  with a as (insert into appointments (resource_id, staff_id, start_at, duration_min, status, source, guest_name)
             select r.id, tests.staff_andi(), at, 40, 'booked', src, 'Dion Uji' from resources r where r.name = 'Kursi Barber 1' returning id),
  s as (insert into appointment_services (appointment_id, service_id) select a.id, sv.id from a, services sv where sv.name = 'Potong Rambut')
  insert into ids select k, id from a
$f$;
delete from outbound_messages where to_address = '6281255550001';

select pg_temp.book('besok', 'admin', jkt(jkt_today() + 1, '14:00'));
select ok(exists (select 1 from outbound_messages where to_address = '6281255550001' and template = 'staff_report'
  and body like E'📅 Booking baru\n% 14.00 · Dion Uji · Potong Rambut · Kursi Barber 1'), 'booking baru → WA ke capster (tanpa no. HP pelanggan)');
select pg_temp.book('walkin', 'walk_in', jkt(jkt_today() + 1, '16:00'));
select pg_temp.book('mepet', 'admin', now() + interval '10 minutes');
select is((select count(*) from outbound_messages where to_address = '6281255550001'), 1::bigint, 'walk-in & booking < 30 menit lagi tidak dikirimi');

-- perubahan nyata terjadi di transaksi lain, setelah booking dibuat
update appointments set created_at = now() - interval '1 hour' where id = (select id from ids where k = 'besok');
update appointments set start_at = jkt(jkt_today() + 1, '15:00') where id = (select id from ids where k = 'besok');
select ok(exists (select 1 from outbound_messages where body like E'🔁 Booking dipindah\n% 15.00 · Dion Uji%'), 'dipindah → WA');
update appointments set status = 'cancelled' where id = (select id from ids where k = 'besok');
select ok(exists (select 1 from outbound_messages where body like E'❌ Booking dibatalkan\n% 15.00 · Dion Uji%'), 'dibatalkan → WA');

-- rekap pagi: jadwal hari ini (booking 'mepet' masih hari ini kecuali dekat tengah malam)
select ok(staff_daily_schedule() >= 0, 'rekap pagi jalan');
select is(appt_line((select id from ids where k = 'mepet'), false) ~ '^\d{2}\.\d{2} · Dion Uji', true, 'baris rekap pagi diawali jam');
select ok((select count(*) from outbound_messages where to_address = '6281255550001' and body like E'📋 Jadwal Andi%') = (select count(*) from ids where k = 'mepet'
  and (select (start_at at time zone 'Asia/Jakarta')::date from appointments where id = ids.id) = jkt_today()), 'rekap pagi hanya bila ada jadwal hari ini');

update staff set whatsapp = null where id = tests.staff_andi();
select is(staff_wa(tests.staff_andi()), null, 'tanpa nomor staf & akun bernomor → tidak dikirim');

select * from finish();
rollback;
