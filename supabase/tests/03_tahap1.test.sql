begin;
\ir helpers.psql
select plan(26);

create table tests.v (k text primary key, v text);
grant all on tests.v to anon, authenticated;
create function tests.get(k text) returns text language sql as $$ select v from tests.v where tests.v.k = $1 $$;
create function tests.put(k text, v text) returns text language sql as $$
  insert into tests.v values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.put('joko', (select a.id::text from appointments a join customers c on c.id = a.customer_id where c.name = 'Joko'));
select tests.put('lina', (select a.id::text from appointments a join customers c on c.id = a.customer_id where c.name = 'Lina'));
select tests.put('rina_cid', (select customer_id::text from profiles where id = tests.rina()));
select tests.put('barber3', (select id::text from resources where name = 'Kursi Barber 3'));
select tests.put('dimas', (select id::text from staff where name = 'Dimas'));

-- ---------- Status koreksi ----------
select tests.login(tests.kasir());
select lives_ok(format($$ select set_appointment_status('%s', 'booked') $$, tests.get('joko')), 'kasir: status boleh mundur untuk koreksi');
select is((select status::text from appointments where id = tests.get('joko')::uuid), 'booked', 'status jadi booked');
select throws_like(format($$ select set_appointment_status('%s', 'paid') $$, tests.get('joko')), '%Gunakan kasir%', 'paid tidak bisa diset manual');
select tests.login(tests.andi());
select throws_like(format($$ select set_appointment_status('%s', 'arrived') $$, tests.get('joko')), '%Akses ditolak%', 'kapster tidak bisa koreksi status bebas');

-- ---------- Batal dengan alasan ----------
select tests.login(tests.kasir());
select throws_like(format($$ select cancel_booking_admin('%s', ' ') $$, tests.get('lina')), '%Alasan%', 'batal wajib alasan');
select cancel_booking_admin(tests.get('lina')::uuid, 'Pelanggan sakit');
select results_eq(format($$ select status::text, cancel_reason from appointments where id = '%s' $$, tests.get('lina')),
                  $$ values ('cancelled', 'Pelanggan sakit') $$, 'booking tetap tercatat dengan alasan');

-- ---------- Booking admin v2 ----------
select tests.put('b1', create_booking_admin(tests.get('barber3')::uuid, tests.get('dimas')::uuid, jkt(jkt_today() + 1, '10:00'),
  array[tests.svc('Potong Rambut')], null, 'Joko Baru', '0813-1111-2222', 'walk_in', '', false, 50)::text);
select is(tests.get('b1')::jsonb ->> 'customer_existing', 'true', 'WA sudah ada → pakai pelanggan yang sama');
select is((select duration_min from appointments where id = (tests.get('b1')::jsonb ->> 'appointment_id')::uuid), 50, 'durasi override tersimpan');
select is(create_booking_admin(tests.get('barber3')::uuid, tests.staff_andi(), jkt(jkt_today() + 1, '10:30'),
  array[tests.svc('Cukur Jenggot')], null, 'Tamu X', null, 'admin') -> 'conflicts' -> 0 ->> 'customer_name', 'Joko',
  'bentrok menyebut siapa (resource sama)');

-- update: pindah ke jam yang bentrok → peringatan; force → tersimpan
select tests.put('b2', create_booking_admin(tests.get('barber3')::uuid, tests.get('dimas')::uuid, jkt(jkt_today() + 1, '13:00'),
  array[tests.svc('Hair Spa')], null, 'Tamu Y', null, 'admin')::text);
select is(update_booking_admin((tests.get('b2')::jsonb ->> 'appointment_id')::uuid, tests.get('barber3')::uuid,
  tests.get('dimas')::uuid, jkt(jkt_today() + 1, '10:15'), array[tests.svc('Hair Spa')]) ->> 'saved', 'false', 'ubah booking: bentrok terdeteksi');
select is(update_booking_admin((tests.get('b2')::jsonb ->> 'appointment_id')::uuid, tests.get('barber3')::uuid,
  tests.get('dimas')::uuid, jkt(jkt_today() + 1, '13:30'), array[tests.svc('Hair Spa')]) ->> 'saved', 'true', 'ubah booking: jam kosong tersimpan');
select is((select to_char(start_at at time zone 'Asia/Jakarta', 'HH24:MI') from appointments
           where id = (tests.get('b2')::jsonb ->> 'appointment_id')::uuid), '13:30', 'jam baru tersimpan');

-- ---------- Checkout: uang diterima ----------
select throws_like(format($$ select checkout('{"items":[{"service_id":"%s","appointment_id":"%s"}],"method":"cash","cash_received":90000}') $$,
                          tests.svc('Potong + Cuci + Styling'), tests.get('joko')),
                   '%kurang%', 'uang diterima kurang ditolak');
select tests.put('tx', checkout(jsonb_build_object('method', 'cash', 'cash_received', 100000, 'items',
  jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong + Cuci + Styling'), 'appointment_id', tests.get('joko')))))::text);
select results_eq(format($$ select paid_amount, cash_received from transactions where id = '%s' $$, tests.get('tx')),
                  $$ values (95000::bigint, 100000::bigint) $$, 'kembalian bisa dihitung ulang dari struk (100.000 − 95.000)');
select throws_like(format($$ update appointments set status = 'booked' where id = '%s' $$, tests.get('joko')),
                   '%lewat void%', 'booking lunas tidak bisa dimundurkan langsung');
select tests.put('tx2', checkout(jsonb_build_object('method', 'qris', 'cash_received', 999999, 'items',
  jsonb_build_array(jsonb_build_object('service_id', tests.svc('Pomade Matte')))))::text);
select is((select cash_received from transactions where id = tests.get('tx2')::uuid), null::bigint, 'QRIS: uang diterima diabaikan');
select topup_deposit(tests.get('rina_cid')::uuid, 'cash', (select id from deposit_packages where name = 'Classic'));

-- ---------- Tutup kasir ----------
select results_eq($$ select (s ->> 'cash_sales')::bigint, (s ->> 'qris_sales')::bigint, (s ->> 'topup_cash')::bigint,
                            (s ->> 'expected_cash')::bigint, (s ->> 'tx_count')::int from cash_summary(jkt_today()) s $$,
                  $$ values (95000::bigint, 110000::bigint, 500000::bigint, 595000::bigint, 2) $$,
                  'rekap: kas diharapkan = tunai penjualan + tunai top-up');
select tests.put('cl', save_cash_closing(jkt_today(), 590000, 'Kurang 5rb')::text);
select results_eq(format($$ select expected_cash, physical_cash, difference from cash_closings where id = '%s' $$, tests.get('cl')),
                  $$ values (595000::bigint, 590000::bigint, -5000::bigint) $$, 'selisih kas tersimpan');
update cash_closings set physical_cash = 595000;  -- RLS: tanpa policy update → 0 baris (trigger juga memblokir)
select is((select physical_cash from cash_closings where id = tests.get('cl')::uuid), 590000::bigint, 'catatan tutup kasir tidak bisa diubah');

-- ---------- Hak akses ----------
select throws_like(format($$ select void_transaction('%s', 'x') $$, tests.get('tx')), '%Akses ditolak%', 'kasir tidak bisa void');
select throws_like($$ select import_customers('[{"name":"A"}]') $$, '%Akses ditolak%', 'kasir tidak bisa impor');
select ok((select count(*) from retail_stock) = 3, 'kasir melihat stok ritel (tanpa HPP)');
select ok((select count(*) from team_names) >= 4, 'kasir melihat nama tim');
select tests.login(tests.andi());
select is((select count(*) from retail_stock) + (select count(*) from team_names) + (select count(*) from cash_closings), 0::bigint,
          'kapster tidak melihat stok, nama tim, atau tutup kasir');

-- ---------- Void v2 & impor (manajer) ----------
select tests.login(tests.mgr());
select void_transaction(tests.get('tx')::uuid, 'salah input');
select is((select status::text from appointments where id = tests.get('joko')::uuid), 'completed', 'void: booking lunas kembali ke completed');
select is(import_customers('[{"name":"Budi Lama","whatsapp":"0819-0000-0001","notes":"clipper #1"},
                             {"name":"Joko Dobel","whatsapp":"081311112222"},
                             {"name":"","whatsapp":"0819"},
                             {"name":"Tanpa WA"}]'),
          '{"inserted": 2, "duplicates": 1, "errors": [{"row": 3, "reason": "Nama kosong"}]}'::jsonb,
          'impor: valid, duplikat, error dihitung');

select * from finish();
rollback;
