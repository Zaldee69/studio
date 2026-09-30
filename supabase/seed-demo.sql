-- HANYA untuk lokal/dev: akun demo (sandi: password123) + jadwal contoh. Jangan jalankan di produksi.

-- ---------- Akun demo (sandi semua: password123) ----------
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change)
select '00000000-0000-0000-0000-000000000000', u.id::uuid, 'authenticated', 'authenticated', u.email,
  crypt('password123', gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', u.meta::jsonb, now(), now(), '', '', '', ''
from (values
  ('00000000-0000-0000-0002-000000000001', 'manajer@groombloom.test', '{"signup":"team","invite_code":"GB-2026","role":"cashier","full_name":"Budi (Manajer)"}'),
  ('00000000-0000-0000-0002-000000000002', 'kasir@groombloom.test',   '{"signup":"team","invite_code":"GB-2026","role":"cashier","full_name":"Nia (Kasir)"}'),
  ('00000000-0000-0000-0002-000000000003', 'andi@groombloom.test',    '{"signup":"team","invite_code":"GB-2026","role":"staff","full_name":"Andi"}'),
  ('00000000-0000-0000-0002-000000000004', 'sari@groombloom.test',    '{"signup":"team","invite_code":"GB-2026","role":"staff","full_name":"Sari"}'),
  ('00000000-0000-0000-0002-000000000005', 'rina@groombloom.test',    '{"full_name":"Rina"}')
) u(id, email, meta);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), id, id::text, jsonb_build_object('sub', id::text, 'email', email), 'email', now(), now(), now()
from auth.users where email like '%@groombloom.test';

update profiles set role = 'manager', active = true where id = '00000000-0000-0000-0002-000000000001';
update profiles set active = true where id = '00000000-0000-0000-0002-000000000002';
update profiles set active = true, staff_id = '00000000-0000-0000-0001-000000000001' where id = '00000000-0000-0000-0002-000000000003';
update profiles set active = true, staff_id = '00000000-0000-0000-0001-000000000004' where id = '00000000-0000-0000-0002-000000000004';
update customers set whatsapp = '6281234567890', notes = 'Clipper #2 samping, gel warna nude'
where email = 'rina@groombloom.test';

-- Pelanggan tamu + jadwal hari ini (untuk halaman uji realtime)
insert into customers (name, whatsapp) values ('Joko', '6281311112222'), ('Lina', '6281355556666');

insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, status, source)
select c.id, r.id, s.id, jkt(jkt_today(), a.t::time), a.dur, a.st::appt_status, a.src::appt_source
from (values
  ('rina@groombloom.test', null, 'Kursi Barber 1', 'Andi', '10:00', 45, 'booked', 'online'),
  (null, 'Joko', 'Kursi Barber 2', 'Rizky', '11:00', 60, 'arrived', 'whatsapp'),
  (null, 'Lina', 'Meja Manicure 1', 'Sari', '13:00', 60, 'booked', 'admin')
) a(email, cname, res, stf, t, dur, st, src)
join customers c on c.email = a.email or c.name = a.cname
join resources r on r.name = a.res
join staff s on s.name = a.stf;

insert into appointment_services (appointment_id, service_id)
select a.id, sv.id from appointments a
join staff s on s.id = a.staff_id
join services sv on sv.name = case s.name when 'Andi' then 'Potong Rambut'
                                          when 'Rizky' then 'Potong + Cuci + Styling'
                                          else 'Gel Polish Tangan' end;

-- Web Push lokal: trigger DB memanggil server Next di mesin host (pg_net berjalan di container DB).
-- Docker Desktop/OrbStack: host.docker.internal · Colima: host.lima.internal. Port = `npm run dev` (3000).
insert into app_config (key, value) values
  ('push_url', 'http://host.docker.internal:3000/api/push'),
  ('push_secret', 'dev-push-secret')
on conflict (key) do update set value = excluded.value;
insert into app_config (key, value) values ('notify_url', 'http://host.docker.internal:3000/api/notifications/dispatch')
on conflict (key) do update set value = excluded.value;
