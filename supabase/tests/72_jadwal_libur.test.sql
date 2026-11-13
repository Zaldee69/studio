begin;
\ir helpers.psql
select plan(22);

-- Jadwal libur (13 Nov): libur tetap, baris libur otomatis, pindah hari, tukar dengan rekan, papan libur.
select tests.su();
-- tanggal minggu ke-n dari sekarang (0 = minggu ini), hari ISO dow
create function tests.wk(n int, dow int) returns date language sql stable as
  $$ select date_trunc('week', jkt_today()::timestamp)::date + n * 7 + dow - 1 $$;
create function tests.off_of(sid uuid, n int) returns date language sql stable security definer as $$
  select (start_at at time zone 'Asia/Jakarta')::date from public.staff_time_off
  where staff_id = sid and kind = 'libur' and start_at >= jkt(tests.wk(n, 1), '00:00') and start_at < jkt(tests.wk(n, 1) + 7, '00:00') $$;
create function tests.off_id(sid uuid, n int) returns uuid language sql stable security definer as $$
  select id from public.staff_time_off
  where staff_id = sid and kind = 'libur' and start_at >= jkt(tests.wk(n, 1), '00:00') and start_at < jkt(tests.wk(n, 1) + 7, '00:00') $$;
grant execute on all functions in schema tests to authenticated;

-- mulai dari keadaan bersih (DB lokal bisa berisi sisa uji manual)
update staff set day_off = null; update profiles set day_off = null;
delete from staff_time_off where kind = 'libur';
create function tests.roster_size() returns int language sql stable security definer as
  $$ select (select count(*)::int from public.staff where active) + (select count(*)::int from public.profiles where active and role = 'cashier') $$;

-- akun kapster ke-2 (Rizky) untuk uji tukar
insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0002-000000000009', 'rizky@t.test',
  jsonb_build_object('signup', 'team', 'invite_code', (select invite_code from settings), 'role', 'staff', 'full_name', 'Rizky'));
update profiles set active = true, staff_id = '00000000-0000-0000-0001-000000000002' where id = '00000000-0000-0000-0002-000000000009';
create function tests.rizky() returns uuid language sql immutable as $$ select '00000000-0000-0000-0002-000000000009'::uuid $$;
create function tests.staff_rizky() returns uuid language sql immutable as $$ select '00000000-0000-0000-0001-000000000002'::uuid $$;
grant execute on all functions in schema tests to authenticated;

-- ---------- libur tetap ----------
select tests.login(tests.mgr());
select throws_like($$ select set_day_off(tests.staff_andi(), null, 5) $$, '%Senin–Kamis%', 'capster tidak bisa libur tetap Jumat');
select lives_ok($$ select set_day_off(tests.staff_andi(), null, 1) $$, 'Andi libur tetap Senin');
select throws_like($$ select set_day_off(tests.staff_rizky(), null, 1) $$, '%capster lain%', 'dua capster tidak libur tetap di hari sama');
select lives_ok($$ select set_day_off(tests.staff_rizky(), null, 2) $$, 'Rizky libur tetap Selasa');
select throws_like($$ select set_day_off(null, tests.kasir(), 3) $$, '%Selasa atau Kamis%', 'kasir libur tetap hanya Selasa/Kamis');
select lives_ok($$ select set_day_off(null, tests.kasir(), 4) $$, 'kasir libur tetap Kamis');

select tests.su();
select is(tests.off_of(tests.staff_andi(), 1), tests.wk(1, 1), 'baris libur Andi minggu depan = Senin');
select is(fill_days_off(), 0, 'isi ulang tidak membuat baris dobel');
select ok(exists (select 1 from staff_time_off where profile_id = tests.kasir() and kind = 'libur'
                  and start_at = jkt(tests.wk(1, 4), '00:00')), 'kasir punya baris libur Kamis minggu depan');

-- ---------- pindah hari sendiri ----------
select tests.login(tests.andi());
select throws_like(format($$ select request_day_off_swap(%L, %L, null, 'x') $$, tests.off_id(tests.staff_andi(), 1), tests.wk(1, 5)),
  '%Senin–Kamis%', 'capster tidak bisa pindah libur ke Jumat');
select throws_like(format($$ select request_day_off_swap(%L, %L, null, 'x') $$, tests.off_id(tests.staff_andi(), 1), tests.wk(1, 2)),
  '%capster lain%', 'tidak bisa pindah ke hari libur capster lain');
select throws_like(format($$ select request_day_off_swap(%L, %L, null, 'x') $$, tests.off_id(tests.staff_andi(), 1), tests.wk(2, 3)),
  '%minggu yang sama%', 'pindah libur hanya di minggu yang sama');
select lives_ok(format($$ select request_day_off_swap(%L, %L, null, 'acara keluarga') $$, tests.off_id(tests.staff_andi(), 1), tests.wk(1, 3)),
  'Andi ajukan pindah Senin → Rabu');
select tests.login(tests.mgr());
select lives_ok($$ select decide_day_off_swap((select id from day_off_swaps where new_date is not null), true) $$, 'manajer menyetujui');
select tests.su();
select is(tests.off_of(tests.staff_andi(), 1), tests.wk(1, 3), 'libur Andi minggu depan pindah ke Rabu');

-- ---------- tukar dengan rekan ----------
select tests.login(tests.andi());
select lives_ok(format($$ select request_day_off_swap(%L, null, %L, 'tukar') $$, tests.off_id(tests.staff_andi(), 2), tests.off_id(tests.staff_rizky(), 2)),
  'Andi ajukan tukar dengan libur Rizky minggu ke-2');
select tests.login(tests.mgr());
select throws_like($$ select decide_day_off_swap((select id from day_off_swaps where partner_off_id is not null), true) $$,
  '%Rekan belum%', 'manajer belum bisa menyetujui sebelum rekan setuju');
select tests.login(tests.rizky());
select lives_ok($$ select respond_day_off_swap((select id from day_off_swaps where partner_off_id is not null), true) $$, 'Rizky setuju');
select tests.login(tests.mgr());
select lives_ok($$ select decide_day_off_swap((select id from day_off_swaps where partner_off_id is not null), true) $$, 'manajer menyetujui tukar');
select tests.su();
select results_eq($$ select tests.off_of(tests.staff_andi(), 2), tests.off_of(tests.staff_rizky(), 2) $$,
  $$ select tests.wk(2, 2), tests.wk(2, 1) $$, 'minggu ke-2: Andi libur Selasa, Rizky Senin');

select tests.login(tests.mgr());
select results_eq($$ select (x ->> 'from_date')::date, (x ->> 'new_date')::date from jsonb_array_elements(
                       (select day_off_board(tests.wk(0, 1), tests.wk(3, 7)) -> 'swaps')) x where x ->> 'partner' is null $$,
  $$ select tests.wk(1, 1), tests.wk(1, 3) $$, 'riwayat pindah tetap Senin → Rabu setelah disetujui');

-- ---------- papan libur ----------
select tests.login(tests.andi());
select results_eq($$ select count(*)::int, count(*) filter (where (x ->> 'me')::boolean)::int
                     from jsonb_array_elements(day_off_board(tests.wk(0, 1), tests.wk(3, 7)) -> 'people') x $$,
  $$ select tests.roster_size(), 1 $$,
  'kapster melihat semua staf & kasir di tabel, satu baris ditandai dirinya');

select * from finish();
rollback;
