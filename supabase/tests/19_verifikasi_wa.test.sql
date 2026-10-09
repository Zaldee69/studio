begin;
\ir helpers.psql
select plan(13);

-- Verifikasi WA akun pelanggan (OTP). Hanya server (service role) yang boleh memanggil.
select tests.su();
-- tamu yang pernah booking dengan WA 081311110001 (punya riwayat), lalu mendaftar akun baru (email terkonfirmasi)
insert into customers (id, name, whatsapp) values ('00000000-0000-0000-00cc-000000000001', 'Budi Tamu', '6281311110001');
insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status) values
  ('00000000-0000-0000-00cc-000000000001', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(),
   jkt(jkt_today() - 5, '10:00'), 30, 'online', 'completed');
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('00000000-0000-0000-00cc-0000000000a1', 'budi@pelanggan.test', now(), '{"full_name":"Budi"}'),
  ('00000000-0000-0000-00cc-0000000000a2', 'baru@pelanggan.test', now(), '{"full_name":"Baru"}');
select isnt((select customer_id from profiles where id = '00000000-0000-0000-00cc-0000000000a1'),
            '00000000-0000-0000-00cc-000000000001'::uuid, 'sebelum verifikasi: akun belum tersambung ke data tamu');

select tests.login('00000000-0000-0000-00cc-0000000000a1');
select throws_like($$ select wa_otp_request('00000000-0000-0000-00cc-0000000000a1', '081311110001', '123456') $$,
                   '%permission denied%', 'pelanggan tidak bisa memanggil OTP langsung (hanya server)');
select tests.su();

select is((wa_otp_request('00000000-0000-0000-00cc-0000000000a1', '0813-1111-0001', '123456') ->> 'ok')::boolean, true, 'kode diminta (nomor dinormalkan)');
select is(wa_otp_verify('00000000-0000-0000-00cc-0000000000a1', '000000') ->> 'code', 'wrong', 'kode salah ditolak');
select is((wa_otp_verify('00000000-0000-0000-00cc-0000000000a1', '123456') ->> 'merged')::boolean, true, 'kode benar: tersambung ke riwayat tamu');
select is((select customer_id from profiles where id = '00000000-0000-0000-00cc-0000000000a1'),
          '00000000-0000-0000-00cc-000000000001'::uuid, 'akun memakai data pelanggan tamu (riwayat & saldo ikut)');
select is((select email from customers where id = '00000000-0000-0000-00cc-000000000001'), 'budi@pelanggan.test', 'email akun dipindah ke data tamu');
select is(wa_otp_verify('00000000-0000-0000-00cc-0000000000a1', '123456') ->> 'code', 'expired', 'kode sekali pakai');

-- akun lain tidak bisa mengambil nomor yang sudah terverifikasi
select is(wa_otp_request('00000000-0000-0000-00cc-0000000000a2', '6281311110001', '654321') ->> 'code', 'taken', 'nomor milik akun lain ditolak');

-- nomor baru (belum pernah dipakai) → tersimpan di data pelanggan akun
select is((wa_otp_request('00000000-0000-0000-00cc-0000000000a2', '081311110002', '654321') ->> 'ok')::boolean, true, 'nomor baru: kode diminta');
select is(wa_otp_verify('00000000-0000-0000-00cc-0000000000a2', '654321') ->> 'ok', 'true', 'nomor baru terverifikasi');
select is((select c.whatsapp from customers c join profiles p on p.customer_id = c.id where p.id = '00000000-0000-0000-00cc-0000000000a2'),
          '6281311110002', 'nomor tersimpan di akun');

-- batas permintaan: maks 3 kode/jam per akun
select wa_otp_request('00000000-0000-0000-00cc-0000000000a2', '081311110003', '111111');
select wa_otp_request('00000000-0000-0000-00cc-0000000000a2', '081311110003', '222222');
select is(wa_otp_request('00000000-0000-0000-00cc-0000000000a2', '081311110003', '333333') ->> 'code', 'rate', 'maks 3 kode per jam');

select * from finish();
rollback;
