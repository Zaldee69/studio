begin;
\ir helpers.psql
select plan(2);

-- Audit BOOK-6 (1 Nov): alert pagi menyebut booking yang statusnya menggantung dari hari sebelumnya.
select tests.su();
insert into appointments (resource_id, staff_id, start_at, duration_min, source, status, guest_name) values
  ((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2026-01-05', '10:00'), 30, 'walk_in', 'booked', 'Basi Uji');
select alert_stale_appointments();
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '🗂️ % booking statusnya menggantung:%Sen, 5 Jan 2026: Terjadwal%'), 'alert menyebut tanggal & status');
select lives_ok($$ select alert_morning() $$, 'alert pagi tetap jalan');

select * from finish();
rollback;
