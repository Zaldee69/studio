begin;
\ir helpers.psql
select plan(46);

create table tests.v (k text primary key, v text);
grant all on tests.v to anon, authenticated;
create function tests.get(k text) returns text language sql as $$ select v from tests.v where tests.v.k = $1 $$;
create function tests.put(k text, v text) returns text language sql as $$
  insert into tests.v values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
create function tests.book(p jsonb) returns jsonb language sql as $$ select book_online(p) $$;
create function tests.req(d date, t text, svc text, extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object('date', d, 'time', t, 'service_ids', jsonb_build_array(tests.svc(svc)), 'together', true) || extra $$;
create function tests.nslots(d date, svc text) returns bigint language sql as $$
  select count(*) from get_available_slots(d, array[tests.svc(svc)]) $$;
grant execute on all functions in schema tests to anon, authenticated;

-- ---------- Akses ----------
select tests.anon();
select throws_like($$ select book_online('{}') $$, '%permission denied%', 'anon tidak bisa memanggil book_online langsung (wajib lewat server + captcha)');
select ok((select count(*) from opening_hours) = 7 and (select count(*) from public_settings) = 1, 'anon membaca jam buka & pengaturan publik');
select is((select count(*) from booking_groups) + (select count(*) from outbound_messages) + (select count(*) from funnel_events)
          + (select count(*) from customers), 0::bigint, 'anon tidak membaca grup booking, antrean pesan, funnel, pelanggan');
select lives_ok($$ select track_funnel('sesi-uji-1234', 'landing') $$, 'anon mencatat funnel');
select tests.login(tests.rina());
select is((select count(*) from my_customer), 1::bigint, 'pelanggan membaca datanya lewat my_customer');
select is((select count(*) from information_schema.columns where table_name = 'my_customer' and column_name = 'notes'), 0::bigint,
          'my_customer tanpa catatan internal');
select is((select count(*) from customers), 0::bigint, 'tabel customers tertutup untuk pelanggan');
select is((select count(*) from customer_stats), 1::bigint, 'statistik & saldo sendiri tetap terbaca');

-- ---------- Aturan slot ----------
select tests.su();
select ok(tests.nslots(jkt_today() + 1, 'Potong Rambut') > 0, 'besok ada slot');
update opening_hours set closed = true where weekday = extract(dow from jkt_today() + 1);
select is(tests.nslots(jkt_today() + 1, 'Potong Rambut'), 0::bigint, 'hari libur mingguan → tanpa slot');
update opening_hours set closed = false, open_time = '12:00', close_time = '15:00' where weekday = extract(dow from jkt_today() + 1);
select results_eq($$ select * from get_available_slots(jkt_today() + 1, array[tests.svc('Potong Rambut')]) $$,
                  $$ values ('12:00'), ('12:30'), ('13:00'), ('13:30'), ('14:00') $$, 'jam buka per hari dihormati');
select is((select open_time::text || '-' || close_time::text from settings), '09:00:00-21:00:00', 'grid konter tetap rentang terluas');
update opening_hours set open_time = '09:00', close_time = '21:00' where weekday = extract(dow from jkt_today() + 1);
insert into special_closures (date, reason) values (jkt_today() + 2, 'Renovasi');
select is(tests.nslots(jkt_today() + 2, 'Potong Rambut'), 0::bigint, 'hari libur khusus → tanpa slot');
select is(tests.nslots(jkt_today() + 15, 'Potong Rambut'), 0::bigint, 'melewati booking_max_days_ahead (14) → tanpa slot');
update settings set booking_lead_minutes = 2880;
select is(tests.nslots(jkt_today() + 1, 'Potong Rambut'), 0::bigint, 'lead time 2 hari → besok tanpa slot');
update settings set booking_lead_minutes = 60;
update services set online_bookable = false where name = 'Hair Spa';
select is(tests.nslots(jkt_today() + 1, 'Hair Spa'), 0::bigint, 'layanan non-online tidak bisa dibooking');
update services set online_bookable = true where name = 'Hair Spa';
-- buffer: isi ketiga kursi barber jam 10:00–10:45 → dengan buffer 30, jam 11:00 ikut tertutup
select tests.book(tests.req(jkt_today() + 3, '10:00', 'Potong Rambut', jsonb_build_object('name', 'B' || i, 'whatsapp', '08129000000' || i)))
from generate_series(1, 3) i;
select ok('11:00' in (select get_available_slots(jkt_today() + 3, array[tests.svc('Potong Rambut')])), 'tanpa buffer: 11:00 tersedia');
update settings set booking_buffer_minutes = 30;
select ok('11:00' not in (select get_available_slots(jkt_today() + 3, array[tests.svc('Potong Rambut')])), 'buffer 30 menit: 11:00 tertutup');
update settings set booking_buffer_minutes = 0;
update settings set online_booking_open = false;
select is(tests.book(tests.req(jkt_today() + 4, '10:00', 'Potong Rambut', '{"name":"X","whatsapp":"081290001111"}')) ->> 'code', 'closed', 'booking online ditutup');
update settings set online_booking_open = true;

-- ---------- Idempotensi, batas tamu, rate limit ----------
select tests.put('r1', tests.book(tests.req(jkt_today() + 4, '10:00', 'Potong Rambut',
  '{"name":"Idem","whatsapp":"081290002222","client_request_id":"req-uji-1"}'))::text);
select tests.put('r2', tests.book(tests.req(jkt_today() + 4, '10:00', 'Potong Rambut',
  '{"name":"Idem","whatsapp":"081290002222","client_request_id":"req-uji-1"}'))::text);
select ok((tests.get('r2')::jsonb ->> 'duplicate')::boolean and tests.get('r1')::jsonb ->> 'code' = tests.get('r2')::jsonb ->> 'code',
          'klik ganda (client_request_id sama) → hasil sama');
select is((select count(*) from booking_groups where client_request_id = 'req-uji-1'), 1::bigint, 'tidak ada booking kembar');
select ok(tests.get('r1')::jsonb ->> 'code' ~ '^GB-[A-Z2-9]{4}$', 'kode booking singkat GB-XXXX');
select tests.book(tests.req(jkt_today() + 4, '11:00', 'Potong Rambut', '{"name":"Idem","whatsapp":"081290002222"}'));
select is(tests.book(tests.req(jkt_today() + 4, '12:00', 'Potong Rambut', '{"name":"Idem","whatsapp":"081290002222"}')) ->> 'code',
          'limit', 'tamu maks 2 booking aktif per no. WA');
select tests.book(tests.req(jkt_today() + 4, '03:00', 'Potong Rambut', jsonb_build_object('name', 'R', 'whatsapp', '08129100000' || i, 'ip', '10.9.9.9')))
from generate_series(1, 5) i;
select is(tests.book(tests.req(jkt_today() + 4, '13:00', 'Potong Rambut', '{"name":"R","whatsapp":"081291000009","ip":"10.9.9.9"}')) ->> 'code',
          'rate', 'rate limit per IP (percobaan gagal ikut dihitung)');

-- ---------- Pelanggan login: pratinjau, batal (cutoff), jadwal ulang ----------
select is(preview_booking(jkt_today() + 5, '10:00', array[tests.svc('Manicure Basic')]) -> 0 ->> 'staff_name', 'Sari', 'pratinjau "Siapa saja" → nama staf');
select tests.put('rb', tests.book(tests.req(jkt_today() + 1, '10:00', 'Potong Rambut', jsonb_build_object('actor', tests.rina())))::text);
select is(tests.get('rb')::jsonb ->> 'ok', 'true', 'pelanggan login booking tanpa nama/WA');
select ok(exists (select 1 from outbound_messages where booking_group_id = (tests.get('rb')::jsonb ->> 'group_id')::uuid
                  and channel = 'email' and template = 'booking_confirmed'), 'email konfirmasi masuk antrean (email terisi)');
select tests.put('rs', tests.book(tests.req(jkt_today() + 1, '11:30', 'Potong Rambut',
  jsonb_build_object('actor', tests.rina(), 'reschedule_group', tests.get('rb')::jsonb ->> 'group_id')))::text);
select is(tests.get('rs')::jsonb ->> 'ok', 'true', 'jadwal ulang berhasil');
select results_eq(format($$ select status::text from appointments where booking_group_id = '%s' $$, tests.get('rb')::jsonb ->> 'group_id'),
                  $$ values ('cancelled') $$, 'booking lama dibatalkan atomik');
select is(tests.book(tests.req(jkt_today() + 1, '12:30', 'Potong Rambut',
  jsonb_build_object('reschedule_group', tests.get('rs')::jsonb ->> 'group_id', 'name', 'X', 'whatsapp', '081290003333'))) ->> 'code',
  'invalid', 'tamu tidak bisa menjadwal ulang booking orang lain');
select tests.login(tests.rina());
update settings set cancel_cutoff_hours = 72;  -- RLS: pelanggan tak bisa ubah settings (0 baris)
select tests.su();
update settings set cancel_cutoff_hours = 72;
select tests.login(tests.rina());
select throws_like(format($$ select cancel_my_booking('%s') $$, tests.get('rs')::jsonb -> 'appointments' -> 0 ->> 'id'),
                   '%jam sebelum mulai%', 'batal melewati cutoff ditolak');
select tests.su();
update settings set cancel_cutoff_hours = 2;
select tests.login(tests.rina());
select lives_ok(format($$ select cancel_my_booking('%s') $$, tests.get('rs')::jsonb -> 'appointments' -> 0 ->> 'id'), 'batal dalam batas waktu');
select is((select count(*) from appointments where customer_id = my_customer_id() and status = 'cancelled' and start_at > now()), 2::bigint,
          'pelanggan melihat booking batalnya sendiri');

-- ---------- Mode review ----------
select tests.su();
update settings set online_booking_mode = 'review';
select tests.put('rv', tests.book(tests.req(jkt_today() + 6, '10:00', 'Potong Rambut', '{"name":"Review","whatsapp":"081290004444"}'))::text);
select is(tests.get('rv')::jsonb ->> 'status', 'pending_review', 'mode review → menunggu persetujuan');
select ok(exists (select 1 from outbound_messages where booking_group_id = (tests.get('rv')::jsonb ->> 'group_id')::uuid and template = 'booking_pending'),
          'pesan "menunggu konfirmasi" diantrekan');
select tests.login(tests.kasir());
select throws_like(format($$ select checkout('{"method":"cash","items":[{"service_id":"%s","appointment_id":"%s"}]}') $$,
                          tests.svc('Potong Rambut'), tests.get('rv')::jsonb -> 'appointments' -> 0 ->> 'id'),
                   '%Terima booking online dulu%', 'booking menunggu tidak bisa dibayar');
select is(review_online_booking((tests.get('rv')::jsonb ->> 'group_id')::uuid, true) ->> 'whatsapp', '6281290004444', 'kasir menerima → dapat no. WA untuk kabar');
select is((select status::text from appointments where booking_group_id = (tests.get('rv')::jsonb ->> 'group_id')::uuid), 'booked', 'status jadi booked');
select tests.login(tests.andi());
select throws_like(format($$ select review_online_booking('%s', true) $$, tests.get('rv')::jsonb ->> 'group_id'), '%Akses ditolak%', 'kapster tidak bisa menerima booking');
select tests.su();
select ok(exists (select 1 from outbound_messages where booking_group_id = (tests.get('rv')::jsonb ->> 'group_id')::uuid and template = 'booking_confirmed'),
  'diterima → konfirmasi masuk antrean pesan');
update settings set online_booking_mode = 'auto';

-- ---------- Pengingat H-1, izin, funnel ----------
select tests.book(tests.req(jkt_today() + 1, '15:00', 'Manicure Basic', jsonb_build_object('actor', tests.rina())));
select ok(enqueue_reminders() >= 1, 'pengingat H-1 diantrekan untuk booking besok');
select is(enqueue_reminders(), 0, 'pengingat tidak dobel');
insert into staff_time_off (staff_id, start_at, end_at, status) values (tests.staff_andi(), jkt(jkt_today() + 7, '00:00'), jkt(jkt_today() + 8, '00:00'), 'approved');
select ok(tests.staff_andi() in (select public_staff_off(jkt_today() + 7)), 'staf izin sehari penuh disembunyikan di langkah Staf');
-- kunjungan nyata (browser dev yang terbuka) ikut tercatat → bandingkan dengan jumlah event landing sesi lain
create function tests.landing_lain() returns int language sql security definer as $$
  select count(*)::int from public.funnel_events where step = 'landing' and session_id <> 'sesi-uji-1234' and created_at > now() - interval '1 day' $$;
grant execute on function tests.landing_lain() to authenticated;
select tests.login(tests.mgr());
select is((funnel_summary(now() - interval '1 day') ->> 'landing')::int - tests.landing_lain(), 1, 'ringkasan funnel untuk manajer');

-- ---------- Hapus akun ----------
select tests.login(tests.rina());
select delete_my_account();
select tests.su();
select results_eq($$ select name, whatsapp, email from customers c where exists (select 1 from transactions t where t.customer_id = c.id)
                     or c.name = 'Pelanggan dihapus' $$, $$ values ('Pelanggan dihapus'::text, null::text, null::text) $$, 'data pribadi dianonimkan');
select is((select active from profiles where id = tests.rina()), false, 'login dinonaktifkan');

select * from finish();
rollback;
