begin;
\ir helpers.psql
select plan(11);

-- Login pelanggan dengan WhatsApp: hook kirim_kode_wa → antrean WA; nomor terverifikasi → akun memakai data pelanggan itu.
select tests.su();
insert into customers (id, name, whatsapp) values ('00000000-0000-0000-00ee-000000000001', 'Tamu Lama', '6281355550001');

-- hook pengirim kode
select is(kirim_kode_wa('{"user": {"phone": "6281355550001"}, "sms": {"otp": "482913"}}'), '{}'::jsonb, 'hook menerima kode');
select is((select body from outbound_messages where template = 'otp' and to_address = '6281355550001'),
          'Kode masuk ' || (select shop_name from settings) || ': 482913. Berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun, termasuk staf '
          || (select shop_name from settings) || '.', 'kode masuk antrean WhatsApp');
select is(kirim_kode_wa('{"user": {"phone": "12"}, "sms": {"otp": "1"}}') -> 'error' ->> 'http_code', '400', 'nomor tidak valid ditolak');
select ok(not has_function_privilege('authenticated', 'kirim_kode_wa(jsonb)', 'execute'), 'hanya Supabase Auth yang boleh memanggil hook');

select tests.login(tests.mgr());
select is((select count(*) from outbound_messages where template = 'otp'), 0::bigint, 'manajer tidak bisa membaca kode masuk');
select tests.su();
update outbound_messages set status = 'sent' where template = 'otp' and to_address = '6281355550001';
select is((select body from outbound_messages where template = 'otp' and to_address = '6281355550001'), null, 'kode dihapus setelah terkirim');

-- nomor pernah dipakai sebagai tamu: belum tersambung sebelum kode benar
insert into auth.users (id, phone) values ('00000000-0000-0000-00ee-0000000000a1', '6281355550001');
select is((select customer_id from profiles where id = '00000000-0000-0000-00ee-0000000000a1'), null, 'sebelum kode benar: belum tersambung');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-00ee-0000000000a1';
select results_eq($$ select customer_id, full_name from profiles where id = '00000000-0000-0000-00ee-0000000000a1' $$,
  $$ values ('00000000-0000-0000-00ee-000000000001'::uuid, 'Tamu Lama'::text) $$, 'kode benar: akun memakai data tamu (nama ikut)');

-- nomor baru → data pelanggan baru dengan nomor itu
insert into auth.users (id, phone, raw_user_meta_data) values ('00000000-0000-0000-00ee-0000000000a2', '6281355550002', '{}');
update auth.users set phone_confirmed_at = now() where id = '00000000-0000-0000-00ee-0000000000a2';
select is((select c.whatsapp from profiles p join customers c on c.id = p.customer_id where p.id = '00000000-0000-0000-00ee-0000000000a2'),
          '6281355550002', 'nomor baru: pelanggan baru dibuat');
select is((select full_name from profiles where id = '00000000-0000-0000-00ee-0000000000a2'), '6281355550002', 'akun baru belum bernama (ditanya di layar)');

-- akun tim tidak ikut disambungkan
select is((select customer_id from profiles where id = tests.kasir()), null, 'akun tim tetap tanpa data pelanggan');

select * from finish();
rollback;
