begin;
\ir helpers.psql
select plan(45);

create table tests.v (k text primary key, v text);
grant all on tests.v to anon, authenticated;
create function tests.get(k text) returns text language sql as $$ select v from tests.v where tests.v.k = $1 $$;
create function tests.put(k text, v text) returns text language sql as $$
  insert into tests.v values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.put('rina_appt', (select a.id::text from appointments a join profiles p on p.customer_id = a.customer_id where p.id = tests.rina()));
select tests.put('lina_appt', (select a.id::text from appointments a join customers c on c.id = a.customer_id where c.name = 'Lina'));

-- ---------- View kapster: hanya miliknya, tanpa WA ----------
select tests.login(tests.andi());
select is((select count(*) from staff_my_appointments), 1::bigint, 'Andi: hanya booking miliknya di view');
select is((select customer_name from staff_my_appointments), 'Rina', 'view memuat nama pelanggan');
select is((select count(*) from information_schema.columns where table_name = 'staff_my_appointments'
           and column_name ~ 'whatsapp|balance|lifetime|price|hpp'), 0::bigint, 'view tidak punya kolom WA/saldo/harga');
select results_eq($$ select name from staff_customer_card $$, $$ values ('Rina') $$, 'kartu pelanggan: hanya yang dilayani Andi');
select is((select count(*) from customers) + (select count(*) from customer_stats) + (select count(*) from deposit_topups), 0::bigint,
          'Andi: tidak membaca customers / saldo / top-up');
select is((select count(*) from appointments where id = tests.get('lina_appt')::uuid), 0::bigint, 'Andi: tidak melihat booking Sari');
select throws_like(format($$ select update_customer_notes((select customer_id from appointments where id = '%s'), 'x') $$, tests.get('lina_appt')),
                   '%', 'Andi: tidak bisa ubah catatan pelanggan Sari');

-- ---------- Status + waktu nyata + koreksi 10 menit ----------
select is(advance_appointment_status(tests.get('rina_appt')::uuid)::text, 'arrived', 'Andi: Pelanggan datang');
select tests.su();
select ok((select arrived_at is not null and status_changed_by = tests.andi() from appointments where id = tests.get('rina_appt')::uuid),
          'arrived_at & pengubah tercatat otomatis');
select tests.login(tests.andi());
select is(advance_appointment_status(tests.get('rina_appt')::uuid)::text, 'in_service', 'Andi: Mulai layanan');
select is(revert_my_status(tests.get('rina_appt')::uuid)::text, 'arrived', 'Andi: batalkan status terakhir (< 10 menit)');
select is((select service_started_at from staff_my_appointments), null::timestamptz, 'koreksi mengosongkan cap mulai');
select throws_like(format($$ select revert_my_status('%s') $$, tests.get('rina_appt')), '%10 menit%', 'koreksi tidak bisa berantai');
select advance_appointment_status(tests.get('rina_appt')::uuid);
select tests.su();
update appointments set status_changed_at = now() - interval '11 minutes' where id = tests.get('rina_appt')::uuid;
select tests.login(tests.andi());
select throws_like(format($$ select revert_my_status('%s') $$, tests.get('rina_appt')), '%10 menit%', 'koreksi lewat 10 menit ditolak');
select tests.login(tests.sari());
select throws_like(format($$ select revert_my_status('%s') $$, tests.get('rina_appt')), '%tidak ditemukan%', 'Sari tidak bisa mengoreksi booking Andi');
select tests.login(tests.andi());
select is(advance_appointment_status(tests.get('rina_appt')::uuid)::text, 'completed', 'Andi: Selesai → ke kasir');
select tests.su();
select ok((select service_started_at is not null and service_ended_at > service_started_at - interval '1 second'
           from appointments where id = tests.get('rina_appt')::uuid), 'mulai & selesai tercatat');
select tests.login(tests.andi());
select throws_like(format($$ select advance_appointment_status('%s') $$, tests.get('rina_appt')), '%tidak bisa dimajukan%', 'kapster tidak bisa ke paid');
select throws_like(format($$ select set_appointment_status('%s', 'booked') $$, tests.get('rina_appt')), '%Akses ditolak%', 'kapster tidak bisa koreksi bebas');
update appointments set status = 'booked', staff_id = null;  -- RLS: kapster tanpa policy update → 0 baris
select tests.su();
select is((select status::text from appointments where id = tests.get('rina_appt')::uuid), 'completed', 'kapster tidak bisa update langsung');

-- kasir mengubah status → cap waktu juga terisi
select tests.login(tests.kasir());
select set_appointment_status(tests.get('lina_appt')::uuid, 'in_service');
select tests.su();
select ok((select arrived_at is not null and service_started_at is not null from appointments where id = tests.get('lina_appt')::uuid),
          'perubahan dari kasir juga mencatat waktu nyata');

-- ---------- Minta ubah jadwal ----------
select tests.login(tests.sari());
select request_schedule_change(tests.get('lina_appt')::uuid, 'Mohon geser ke 14:00');
select throws_like(format($$ select request_schedule_change('%s', 'x') $$, tests.get('rina_appt')), '%tidak ditemukan%', 'hanya booking sendiri');
select tests.login(tests.kasir());
select is((select change_request from appointments where id = tests.get('lina_appt')::uuid), 'Mohon geser ke 14:00', 'konter melihat permintaan');
select update_booking_admin(tests.get('lina_appt')::uuid, resource_id, staff_id, start_at + interval '1 hour',
  array(select service_id from appointment_services where appointment_id = tests.get('lina_appt')::uuid), null, null, true)
from appointments where id = tests.get('lina_appt')::uuid;
select is((select change_request from appointments where id = tests.get('lina_appt')::uuid), null, 'permintaan hilang setelah jadwal dipindah');

-- ---------- Izin / cuti ----------
select tests.login(tests.andi());
select tests.put('off', request_time_off(jkt(jkt_today() + 1, '00:00'), jkt(jkt_today() + 2, '00:00'), true, 'Acara keluarga')::text);
select is((select status::text from staff_time_off where id = tests.get('off')::uuid), 'pending', 'pengajuan tersimpan pending');
select throws_like(format($$ select decide_time_off('%s', true) $$, tests.get('off')), '%Akses ditolak%', 'kapster tidak bisa menyetujui izinnya sendiri');
select tests.login(tests.sari());
select is((select count(*) from staff_time_off), 0::bigint, 'Sari tidak melihat izin Andi');
select throws_like(format($$ select cancel_time_off('%s') $$, tests.get('off')), '%tidak ditemukan%', 'Sari tidak bisa membatalkan izin Andi');
select tests.login(tests.kasir());
select is(create_booking_admin((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt(jkt_today() + 1, '10:00'),
  array[tests.svc('Potong Rambut')], null, 'Tamu Besok', null, 'admin') ->> 'saved', 'true', 'booking Andi besok (sebelum izin)');
select tests.login(tests.mgr());
select decide_time_off(tests.get('off')::uuid, true);
select is((select status::text from staff_time_off where id = tests.get('off')::uuid), 'approved', 'manajer menyetujui');
select is(jsonb_array_length(time_off_conflicts(tests.get('off')::uuid)), 1, 'booking terdampak izin terdaftar');
select tests.anon();
select is((select count(*) from get_available_slots(jkt_today() + 1, array[tests.svc('Potong Rambut')], jsonb_build_object('barbershop', tests.staff_andi()))),
          0::bigint, 'slot online tidak menawarkan Andi saat izin');
select ok((select count(*) from get_available_slots(jkt_today() + 1, array[tests.svc('Potong Rambut')])) > 0, 'staf lain tetap ditawarkan');

-- ---------- Komisi saya ----------
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', tests.get('rina_appt')),
  jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari()))));
select tests.login(tests.andi());
select is((select sum(commission)::bigint from commission_items(jkt_today())),
          (select commission_service + commission_retail from commission_for_period(jkt_today())), 'rincian komisi = total fungsi server');
select is((select count(*) from commission_items(jkt_today()) where name = 'Manicure Basic'), 0::bigint, 'rincian hanya layanan sendiri');
select is((select count(*) from commission_items(jkt_today()) where hpp is not null), 0::bigint, 'rincian komisi tidak mengirim HPP');
select is((select of_count from staff_leaderboard(date_trunc('month', jkt_today())::date, jkt_today())), 6, 'peringkat dari 6 staf aktif');

-- ---------- Push subscription: milik sendiri ----------
insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/andi', 'k', 'a');
select tests.login(tests.sari());
select is((select count(*) from push_subscriptions), 0::bigint, 'Sari tidak melihat langganan push Andi');

-- ---------- PIN stasiun ----------
select tests.login(tests.andi());
select throws_like($$ select set_staff_pin('00000000-0000-0000-0001-000000000001', '1234') $$, '%Akses ditolak%', 'kapster tidak bisa mengatur PIN');
select throws_like($$ select verify_staff_pin('x', '00000000-0000-0000-0001-000000000001', '1234') $$, '%permission denied%', 'verifikasi PIN hanya server');
select tests.login(tests.mgr());
select set_staff_pin(tests.staff_andi(), '4321');
select register_station('Tablet depan', 'hash-uji');
select tests.su();
select is((select count(*) from station_staff('hash-uji')), 2::bigint, 'stasiun: staf dengan akun (Andi, Sari)');
select is(verify_staff_pin('hash-salah', tests.staff_andi(), '4321') ->> 'reason', 'device', 'perangkat tak terdaftar ditolak');
select is(verify_staff_pin('hash-uji', tests.staff_andi(), '4321') ->> 'email', 'andi@groombloom.test', 'PIN benar → akun kapster');
select verify_staff_pin('hash-uji', tests.staff_andi(), '0000') from generate_series(1, 5);
select is(verify_staff_pin('hash-uji', tests.staff_andi(), '4321') ->> 'reason', 'locked', '5× salah → terkunci walau PIN benar');
select ok((select pin_hash <> '4321' and pin_hash like '$2%' from staff_pins where staff_id = tests.staff_andi()), 'PIN tersimpan sebagai hash bcrypt');

select * from finish();
rollback;
