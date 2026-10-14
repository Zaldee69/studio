begin;
\ir helpers.psql
select plan(6);

-- Pendaftaran tim: hanya email terverifikasi yang bisa diaktifkan; setiap aktivasi mengganti kode undangan.
select tests.su();
select invite_code as code0 from settings \gset
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-00dd-000000000001', 'belum@t.test', json_build_object('signup', 'team', 'invite_code', :'code0', 'role', 'cashier', 'full_name', 'Belum')::jsonb),
  ('00000000-0000-0000-00dd-000000000002', 'sudah@t.test', json_build_object('signup', 'team', 'invite_code', :'code0', 'role', 'cashier', 'full_name', 'Sudah')::jsonb);
update auth.users set email_confirmed_at = now() where id = '00000000-0000-0000-00dd-000000000002';

select tests.login(tests.kasir());
select is((select count(*) from team_signups()), 0::bigint, 'selain manajer tidak melihat daftar pendaftar');
select tests.login(tests.mgr());
select is((select count(*) from team_signups() where email like '%@t.test'), 2::bigint, 'manajer melihat pendaftar menunggu persetujuan');
select is((select email_confirmed_at is null from team_signups() where email = 'belum@t.test'), true, 'status verifikasi email tampil');
select throws_like($$ update profiles set active = true where id = '00000000-0000-0000-00dd-000000000001' $$, '%belum diverifikasi%',
  'email belum terverifikasi → tidak bisa diaktifkan');
select lives_ok($$ update profiles set active = true where id = '00000000-0000-0000-00dd-000000000002' $$, 'email terverifikasi → aktif');
select tests.su();
select isnt((select invite_code from settings), :'code0', 'kode undangan diganti setelah aktivasi');

select * from finish();
rollback;
