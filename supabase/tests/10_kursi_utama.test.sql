begin;
\ir helpers.psql
select plan(11);

create function tests.chair(pick text) returns text language sql as $$
  select r.name from resources r
  where r.id = (plan_booking(jkt_today() + 1, 600, array[tests.svc('Potong Rambut')],
                            jsonb_build_object('barbershop', (select id from staff where name = pick)), true) -> 0 ->> 'resource_id')::uuid $$;

select is(tests.chair('Rizky'), 'Kursi Barber 2', 'booking Rizky → kursi utamanya (Kursi Barber 2)');
insert into appointments (resource_id, start_at, duration_min, end_at, status, source)
select id, jkt(jkt_today() + 1, '10:00'), 45, jkt(jkt_today() + 1, '10:45'), 'booked', 'admin' from resources where name = 'Kursi Barber 2';
select is(tests.chair('Rizky'), null, 'kursi terikat (13 Nov): kursi Rizky terpakai → Rizky tidak dipindah ke kursi lain');
select is((select s.name from appointments a join staff s on s.id = a.staff_id join resources r on r.id = a.resource_id
           where r.name = 'Kursi Barber 2' and a.start_at = jkt(jkt_today() + 1, '10:00')), 'Rizky', 'booking tanpa capster di kursi bertuan → otomatis ke pemiliknya');
-- Bug Tahap 3: booking konter (tanpa booking_group_id) harus menutup slot online kursi & staf itu.
insert into appointments (resource_id, staff_id, start_at, duration_min, end_at, status, source)
select r.id, (select id from staff where name = 'Andi'), jkt(jkt_today() + 1, '14:00'), 45, jkt(jkt_today() + 1, '14:45'), 'booked', 'admin'
from resources r where r.name = 'Kursi Barber 1';
select ok('14:00' not in (select get_available_slots(jkt_today() + 1, array[tests.svc('Potong Rambut')], jsonb_build_object('barbershop', (select id from staff where name = 'Andi')))),
          'booking konter Andi 14:00 → slot online Andi 14:00 tertutup');
select isnt(plan_booking(jkt_today() + 1, 840, array[tests.svc('Potong Rambut')], '{}', true) -> 0 ->> 'resource_id',
            (select id::text from resources where name = 'Kursi Barber 1'), 'booking online "Siapa saja" 14:00 tidak memakai kursi yang sudah terisi');
-- Kursi terikat (13 Nov)
select throws_like($$ insert into appointments (resource_id, staff_id, start_at, duration_min, status, source)
  select (select id from resources where name = 'Kursi Barber 2'), (select id from staff where name = 'Andi'), jkt(jkt_today() + 1, '16:00'), 45, 'booked', 'admin' $$,
  '%khusus untuk Rizky%', 'Andi tidak bisa dibooking di kursi Rizky');
insert into staff_time_off (staff_id, start_at, end_at, all_day, status, kind)
select id, jkt(jkt_today() + 1, '00:00'), jkt(jkt_today() + 2, '00:00'), true, 'approved', 'libur' from staff where name = 'Dimas';
select throws_like($$ insert into appointments (resource_id, staff_id, start_at, duration_min, status, source)
  select (select id from resources where name = 'Kursi Barber 3'), (select id from staff where name = 'Dimas'), jkt(jkt_today() + 1, '16:00'), 45, 'booked', 'admin' $$,
  '%tidak aktif%libur%', 'Dimas libur → kursinya tidak bisa dibooking');
select ok(coalesce(plan_booking(jkt_today() + 1, 960, array[tests.svc('Potong Rambut')], '{}', true) -> 0 ->> 'resource_id', '')
          <> (select id::text from resources where name = 'Kursi Barber 3'), 'booking online tidak memakai kursi Dimas saat Dimas libur');
select throws_like($$ update staff set home_resource_id = (select id from resources where name = 'Kursi Barber 1') where name = 'Dimas' $$,
  '%sudah menjadi kursi Andi%', 'satu kursi untuk satu capster');
select throws_like($$ update staff set home_resource_id = (select id from resources where name = 'Meja Manicure 1') where name = 'Andi' $$,
                   '%sesuai kategori%', 'kapster tidak bisa diberi meja nail sebagai kursi utama');
delete from resources where name = 'Kursi Barber 3' and not exists (select 1 from appointments a where a.resource_id = resources.id);
select is((select home_resource_id from staff where name = 'Dimas'), null, 'kursi dihapus → kursi utama staf jadi kosong');

select * from finish();
rollback;
