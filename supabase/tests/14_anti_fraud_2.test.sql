begin;
\ir helpers.psql
select plan(15);

select tests.su();
grant execute on all functions in schema tests to authenticated;
create function tests.appt(p_id uuid, p_status appt_status, p_hour text) returns void language sql security definer as $$
  insert into appointments (id, resource_id, staff_id, start_at, duration_min, source, status)
  values (p_id, (select id from public.resources where name = 'Kursi Barber 2'), tests.staff_andi(), jkt(jkt_today() + 4, p_hour::time), 30, 'admin', 'booked');
  update appointments set status = p_status where id = p_id and p_status <> 'booked';
$$;
select tests.appt('00000000-0000-0000-00fe-000000000001', 'booked', '09:00');
select tests.appt('00000000-0000-0000-00fe-000000000002', 'completed', '10:00');
select tests.appt('00000000-0000-0000-00fe-000000000003', 'completed', '11:00');

-- ---------- audit log ----------
select tests.login(tests.kasir());
select cancel_booking_admin('00000000-0000-0000-00fe-000000000001', 'Pelanggan minta batal');
select tests.su();
select ok(exists (select 1 from audit_log where entity = 'appointments' and entity_id = '00000000-0000-0000-00fe-000000000001'
                    and actor = tests.kasir() and changes -> 'status' ->> 1 = 'cancelled'), 'pembatalan tercatat: siapa & status lama → baru');
select throws_like($$ update audit_log set action = 'x' $$, '%immutable%', 'audit log tidak bisa diubah');
select tests.login(tests.kasir());
select is((select count(*) from audit_log), 0::bigint, 'kasir tidak bisa membaca audit log');

-- ---------- layanan yang sudah dikerjakan ----------
select throws_like($$ select cancel_booking_admin('00000000-0000-0000-00fe-000000000002', 'salah input') $$,
                   '%sudah dikerjakan%', 'kasir tidak bisa membatalkan booking yang sudah selesai dilayani');
select throws_like($$ select set_appointment_status('00000000-0000-0000-00fe-000000000002', 'booked') $$,
                   '%sudah dikerjakan%', 'kasir tidak bisa memundurkan status layanan selesai');
select tests.login(tests.mgr());
select lives_ok($$ select cancel_booking_admin('00000000-0000-0000-00fe-000000000003', 'Komplain, digratiskan') $$,
                'manajer boleh membatalkan (tercatat)');

select tests.su();
update appointments set status_changed_at = now() - interval '45 minutes' where id = '00000000-0000-0000-00fe-000000000002';
select ok(unpaid_completed_alerts() >= 1, 'selesai > 30 menit belum dibayar → notifikasi manajer');
select ok(unpaid_completed_alerts() = 0, 'notifikasi tidak berulang untuk booking yang sama');

-- ---------- QRIS ----------
select tests.login(tests.kasir());
select throws_like(format($$ select checkout('{"method":"qris","items":[{"service_id":"%s"}]}') $$, tests.svc('Pomade Matte')),
                   '%referensi QRIS%', 'QRIS tanpa No. referensi ditolak');
select lives_ok(format($$ select checkout('{"method":"qris","qris_ref":"ab 12-99","items":[{"service_id":"%s"}]}') $$, tests.svc('Pomade Matte')),
                'QRIS dengan No. referensi → tersimpan');
select tests.su();
select ok(exists (select 1 from transactions where qris_ref = 'AB1299'), 'No. ref dinormalisasi (huruf besar, tanpa spasi/strip)');
select tests.login(tests.kasir());
select throws_like(format($$ select checkout('{"method":"qris","qris_ref":"AB1299","items":[{"service_id":"%s"}]}') $$, tests.svc('Pomade Matte')),
                   '%sudah dipakai%', 'No. ref yang sama tidak bisa dipakai dua kali');
select throws_like($$ select topup_deposit((select id from customers limit 1), 'qris', null, 50000) $$,
                   '%referensi QRIS%', 'top-up QRIS juga wajib No. referensi');

-- ---------- ringkasan ----------
select throws_like($$ select fraud_overview(jkt_today() - 7, jkt_today()) $$, '%Akses ditolak%', 'ringkasan hanya untuk manajer');
select tests.login(tests.mgr());
select ok(jsonb_array_length(fraud_overview(jkt_today() - 7, jkt_today()) -> 'cancels') >= 2, 'ringkasan memuat pembatalan oleh tim');

select * from finish();
rollback;
