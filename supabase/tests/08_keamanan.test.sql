begin;
\ir helpers.psql
select plan(14);

-- Data pelanggan lama (walk-in) yang emailnya tercatat kasir, belum punya akun.
insert into customers (id, name, email) values
  ('00000000-0000-0000-0009-000000000001', 'Korban A', 'a@korban.test'),
  ('00000000-0000-0000-0009-000000000002', 'Korban B', 'b@korban.test'),
  ('00000000-0000-0000-0009-000000000003', 'Korban C', 'c@korban.test');
create function tests.cust_of(e text) returns uuid language sql as $$ select customer_id from profiles where email = e $$;

-- ---------- 1. Tautan ke data lama hanya setelah konfirmasi email ----------
-- Alur normal (Confirm email aktif): daftar → email konfirmasi dikirim → diklik.
insert into auth.users (id, email, confirmation_sent_at) values ('00000000-0000-0000-0009-00000000000a', 'a@korban.test', now());
select is(tests.cust_of('a@korban.test'), null, 'daftar: belum tersambung ke data lama sebelum konfirmasi');
update auth.users set email_confirmed_at = now() where email = 'a@korban.test';
select is(tests.cust_of('a@korban.test'), '00000000-0000-0000-0009-000000000001'::uuid, 'konfirmasi email → riwayat & saldo lama tersambung');

-- Confirm email dimatikan (autoconfirm, tanpa email terkirim): tidak ada bukti kepemilikan.
insert into auth.users (id, email) values ('00000000-0000-0000-0009-00000000000b', 'b@korban.test');
update auth.users set email_confirmed_at = now() where email = 'b@korban.test';
select isnt(tests.cust_of('b@korban.test'), '00000000-0000-0000-0009-000000000002'::uuid, 'autoconfirm: tidak mengambil data pelanggan lama');
select is((select email from customers where id = tests.cust_of('b@korban.test')), null, 'autoconfirm: dapat data baru, email tidak diduplikasi');

-- Dibuat sudah terkonfirmasi (admin/seed) dengan email yang dipakai data lain.
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0009-00000000000c', 'c@korban.test', now());
select isnt(tests.cust_of('c@korban.test'), '00000000-0000-0000-0009-000000000003'::uuid, 'akun admin/seed: tidak mengambil data lama');
-- Email baru tanpa data lama → data pelanggan baru dengan email itu.
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0009-00000000000d', 'baru@pelanggan.test', now());
select is((select email from customers where id = tests.cust_of('baru@pelanggan.test')), 'baru@pelanggan.test', 'email baru: data pelanggan dibuat');

select tests.login('00000000-0000-0000-0009-00000000000b');
select is((select count(*) from my_customer where name = 'Korban B'), 0::bigint, 'penyerang (autoconfirm) tidak membaca data korban');
select tests.su();

-- ---------- 2. Verifikasi 2 langkah ----------
select tests.login(tests.mgr());
select is(auth_role(), 'manager'::app_role, 'tanpa faktor MFA: sesi sandi (aal1) cukup');
select tests.su();
insert into auth.mfa_factors (id, user_id, friendly_name, factor_type, status, created_at, updated_at, secret)
values (gen_random_uuid(), tests.mgr(), 'tes', 'totp', 'verified', now(), now(), 'x');
select tests.login(tests.mgr());
select is(auth_role(), null, 'faktor aktif + aal1: peran tidak dikenali RLS');
select is((select count(*) from transactions), 0::bigint, 'faktor aktif + aal1: transaksi tertutup');
select set_config('request.jwt.claims', json_build_object('sub', tests.mgr(), 'role', 'authenticated', 'aal', 'aal2')::text, true);
select is(auth_role(), 'manager'::app_role, 'faktor aktif + aal2: peran manajer');
select tests.login(tests.mgr());
select throws_like($$ update profiles set mfa_enabled = false where id = auth.uid() $$, '%verifikasi 2 langkah%',
                   'pengguna tidak bisa mematikan tanda MFA sendiri (melewati kode)');
select tests.su();
delete from auth.mfa_factors where user_id = tests.mgr();
select is((select mfa_enabled from profiles where id = tests.mgr()), false, 'faktor dihapus → tanda MFA ikut mati');

-- ---------- 3. Kode undangan bawaan acak ----------
select ok((select column_default from information_schema.columns where table_name = 'settings' and column_name = 'invite_code') like '%gen_random_uuid%',
          'kode undangan bawaan acak (bukan GB-2026)');

select * from finish();
rollback;
