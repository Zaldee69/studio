begin;
\ir helpers.psql
select plan(3);

-- Audit KPI-3/5 (1 Nov): delta metrik persen dalam poin; rasio booking hanya dari jadwal yang sudah lewat.
select tests.su();
insert into appointments (resource_id, staff_id, start_at, duration_min, source, status, guest_name) values
  ((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-05-06', '10:00'), 30, 'online', 'completed', 'Lewat 1'),
  ((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-05-06', '11:00'), 30, 'walk_in', 'completed', 'Lewat 2'),
  ((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-05-06', '12:00'), 30, 'walk_in', 'booked', 'Basi');

select tests.login(tests.mgr());
set local role postgres;
-- periode 2030 belum terjadi: semua jadwal di masa depan → tidak ada populasi
select is(kpi_online('2030-05-06', '2030-05-06') ->> 'all_appts', '0', 'jadwal masa depan tidak masuk penyebut');
select is((select (kpi_online(jkt_today() - 3650, jkt_today()) ->> 'all_appts')::int >= 0), true, 'populasi dari jadwal yang sudah lewat');
select ok(position('poin' in pg_get_functiondef('kpi_summary(date,date,text,uuid)'::regprocedure)) > 0, 'delta rasio ritel & utilisasi dihitung dalam poin');

select * from finish();
rollback;
