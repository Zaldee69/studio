begin;
\ir helpers.psql
select plan(31);

create table tests.v (k text primary key, v text);
grant all on tests.v to anon, authenticated;
create function tests.get(k text) returns text language sql as $$ select v from tests.v where tests.v.k = $1 $$;
create function tests.put(k text, v text) returns text language sql as $$
  insert into tests.v values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
grant execute on all functions in schema tests to anon, authenticated;

select tests.put('rina_cid', (select customer_id::text from profiles where id = tests.rina()));
select tests.put('rina_appt', (select id::text from appointments where customer_id = tests.get('rina_cid')::uuid));
select tests.put('pomade', (select id::text from inventory_items where name = 'Pomade Matte'));
select tests.put('shampoo', (select id::text from inventory_items where name = 'Shampoo salon'));
select tests.put('pomade0', (select qty::text from stock_levels where item_id = tests.get('pomade')::uuid));
select tests.put('shampoo0', (select qty::text from stock_levels where item_id = tests.get('shampoo')::uuid));

-- ---------- Checkout: bundle + deposit + stok ----------
select tests.login(tests.kasir());
select topup_deposit(tests.get('rina_cid')::uuid, 'qris', (select id from deposit_packages where name = 'Prestige'));
select is((select deposit_balance from customer_stats where customer_id = tests.get('rina_cid')::uuid), 1750000::bigint,
          'top-up Prestige: bayar 1.500.000 → saldo 1.750.000');

select tests.put('tx', checkout(jsonb_build_object(
  'items', jsonb_build_array(
    jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'appointment_id', tests.get('rina_appt'), 'price', 1),
    jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari()),
    jsonb_build_object('service_id', tests.svc('Pomade Matte'))),
  'use_deposit', true, 'method', 'cash', 'total', 1))::text);

select results_eq(
  $$ select subtotal, discount_amount, total, deposit_used, paid_amount, payment_method::text
     from transactions where id = tests.get('tx')::uuid $$,
  $$ values (275000::bigint, 16500::bigint, 258500::bigint, 258500::bigint, 0::bigint, 'deposit') $$,
  'checkout: harga server, diskon bundle 10% dibulatkan Rp100, deposit menutup semua');
select results_eq(
  $$ select name, discount_share, net_amount, staff_id from transaction_items
     where transaction_id = tests.get('tx')::uuid order by price $$,
  $$ values ('Potong Rambut', 7500::bigint, 67500::bigint, '00000000-0000-0000-0001-000000000001'::uuid),
            ('Manicure Basic', 9000::bigint, 81000::bigint, '00000000-0000-0000-0001-000000000004'::uuid),
            ('Pomade Matte', 0::bigint, 110000::bigint, null::uuid) $$,
  'checkout: porsi diskon proporsional, staf dari booking, ritel tanpa staf');
select is((select status::text from appointments where id = tests.get('rina_appt')::uuid), 'paid', 'checkout: booking → paid');
select is((select deposit_balance from customer_stats where customer_id = tests.get('rina_cid')::uuid), 1491500::bigint,
          'checkout: saldo deposit berkurang');
select throws_like(format($$ select checkout('{"items":[{"service_id":"%s","appointment_id":"%s"}],"method":"cash"}') $$,
                          tests.svc('Potong Rambut'), tests.get('rina_appt')),
                   '%sudah dibayar%', 'checkout: booking yang sama tidak bisa dibayar dua kali');
select throws_like(format($$ select checkout('{"items":[{"service_id":"%s"}],"method":"cash"}') $$, tests.svc('Hair Spa')),
                   '%Pilih kapster%', 'checkout: layanan wajib punya kapster');
select throws_like(format($$ select checkout('{"items":[{"service_id":"%s"}],"method":"cash","use_deposit":true}') $$,
                          tests.svc('Pomade Matte')),
                   '%butuh data pelanggan%', 'checkout: deposit tanpa pelanggan ditolak');

-- deposit sebagian + QRIS
select tests.put('tx2', checkout(jsonb_build_object('customer_id', tests.get('rina_cid'), 'use_deposit', true, 'method', 'qris',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()))))::text);
select results_eq($$ select total, deposit_used, paid_amount, payment_method::text from transactions where id = tests.get('tx2')::uuid $$,
                  $$ values (1750000::bigint, 1491500::bigint, 258500::bigint, 'deposit_qris') $$,
                  'checkout: sisa setelah deposit dibayar QRIS');
select is((select deposit_balance from customer_stats where customer_id = tests.get('rina_cid')::uuid), 0::bigint, 'saldo habis, tidak minus');

-- ---------- Stok ----------
select tests.login(tests.mgr());
select is((select qty from stock_levels where item_id = tests.get('pomade')::uuid), tests.get('pomade0')::numeric - 1,
          'stok ritel berkurang 1 (sale)');
select is((select qty from stock_levels where item_id = tests.get('shampoo')::uuid),
          tests.get('shampoo0')::numeric - 20 - 7 * 30, 'bahan resep berkurang (use)');
select is((select sum(c.hpp) from transaction_item_costs c join transaction_items i on i.id = c.transaction_item_id
           where i.transaction_id = tests.get('tx')::uuid)::bigint, (1300 + 2000 + 60000)::bigint, 'snapshot HPP tersimpan');

-- ---------- Komisi ----------
select results_eq(
  $$ select service_count, revenue_net, commission_service, subsidy, total_pay from commission_for_period(jkt_today())
     where staff_id = '00000000-0000-0000-0001-000000000004' $$,
  $$ values (1, 81000::bigint, 31600::bigint, 1168400::bigint, 1200000::bigint) $$,
  'komisi Sari: (81.000 − 2.000) × 40% + subsidi jaring pengaman');

-- ---------- Void ----------
select tests.login(tests.kasir());
select throws_like(format($$ select void_transaction('%s', 'salah input') $$, tests.get('tx')), '%Akses ditolak%', 'void: kasir ditolak');
select tests.login(tests.mgr());
select void_transaction(tests.get('tx2')::uuid, 'salah input');
select is((select deposit_balance from customer_stats where customer_id = tests.get('rina_cid')::uuid), 1491500::bigint,
          'void: deposit terpakai kembali');
select is((select qty from stock_levels where item_id = tests.get('shampoo')::uuid),
          tests.get('shampoo0')::numeric - 20, 'void: mutasi stok balik');
select throws_like(format($$ select void_transaction('%s', 'lagi') $$, tests.get('tx2')), '%sudah di-void%', 'void: tidak bisa dua kali');

-- ---------- Booking online (server: book_online, dipanggil setelah captcha) ----------
select tests.su();
create function tests.book(d date, t text, ids uuid[], pick jsonb, together boolean, nm text, wa text) returns jsonb
language sql as $$ select book_online(jsonb_build_object('date', d, 'time', t, 'service_ids', to_jsonb(ids),
  'staff_pick', pick, 'together', together, 'name', nm, 'whatsapp', wa)) $$;
select tests.anon();
select ok('10:00' in (select get_available_slots(jkt_today() + 1, array[tests.svc('Potong Rambut')])), 'slot 10:00 besok tersedia (anon)');
select tests.su();
select is(jsonb_array_length(tests.book(jkt_today() + 1, '10:00', array[tests.svc('Potong Rambut')],
          jsonb_build_object('barbershop', tests.staff_andi()), true, 'Tamu A', '0811-1111-1111') -> 'appointments'), 1, 'booking tamu tersimpan');
select is(tests.book(jkt_today() + 1, '10:00', array[tests.svc('Potong Rambut')], jsonb_build_object('barbershop', tests.staff_andi()),
          true, 'Tamu B', '081122222222') ->> 'code', 'slot_taken', 'booking dobel staf yang sama ditolak');
select tests.book(jkt_today() + 1, '10:00', array[tests.svc('Potong Rambut')], '{}', true, 'Tamu C', '081133333333');
select tests.book(jkt_today() + 1, '10:00', array[tests.svc('Potong Rambut')], '{}', true, 'Tamu D', '081144444444');
select is(tests.book(jkt_today() + 1, '10:00', array[tests.svc('Potong Rambut')], '{}', true, 'Tamu E', '081155555555') ->> 'code',
          'slot_taken', 'kursi barber penuh → ditolak');
select is((select source::text from appointments a join customers c on c.id = a.customer_id where c.whatsapp = '6281111111111'),
          'online', 'no. WA dinormalisasi, source = online');

-- berdua bersamaan: barber + pedicure → 2 appointment, nail di kursi pedicure
select tests.put('pair', (tests.book(jkt_today() + 2, '14:00',
  array[tests.svc('Potong Rambut'), tests.svc('Pedicure Basic')], '{}', true, 'Pasangan', '081166666666') -> 'appointments')::text);
select results_eq($$ select r.name, to_char(a.start_at at time zone 'Asia/Jakarta', 'HH24:MI') from appointments a
                     join resources r on r.id = a.resource_id where a.id in (select (x ->> 'id')::uuid from jsonb_array_elements(tests.get('pair')::jsonb) x) order by r.type $$,
                  $$ values ('Kursi Barber 1', '14:00'), ('Kursi Pedicure', '14:00') $$,
                  'berdua bersamaan: mulai sama, pedicure dapat kursi pedicure');

-- sendiri berurutan: nail mulai setelah barber selesai
select tests.put('seq', (tests.book(jkt_today() + 2, '10:00',
  array[tests.svc('Potong Rambut'), tests.svc('Manicure Basic')], '{}', false, 'Solo', '081177777777') -> 'appointments')::text);
select results_eq($$ select to_char(a.start_at at time zone 'Asia/Jakarta', 'HH24:MI') from appointments a
                     where a.id in (select (x ->> 'id')::uuid from jsonb_array_elements(tests.get('seq')::jsonb) x) order by a.start_at $$,
                  $$ values ('10:00'), ('10:45') $$, 'sendiri berurutan: nail setelah barber');
select is((select string_agg(x ->> 'staff_name', ',' order by x ->> 'category') from jsonb_array_elements(tests.get('seq')::jsonb) x),
          'Andi,Sari', 'hasil booking memuat nama staf yang ditugaskan');

-- ---------- Booking admin: bentrok = peringatan lunak ----------
select tests.login(tests.kasir());
select tests.put('adm', create_booking_admin((select resource_id from appointments where id = tests.get('rina_appt')::uuid),
  tests.staff_andi(), (select start_at from appointments where id = tests.get('rina_appt')::uuid),
  array[tests.svc('Cukur Jenggot')], null, 'Walk-in', null, 'walk_in')::text);
select is(tests.get('adm')::jsonb ->> 'saved', 'false', 'admin: bentrok → belum disimpan, kembalikan daftar bentrok');
select is(create_booking_admin((select resource_id from appointments where id = tests.get('rina_appt')::uuid),
  tests.staff_andi(), (select start_at from appointments where id = tests.get('rina_appt')::uuid),
  array[tests.svc('Cukur Jenggot')], null, 'Walk-in', null, 'walk_in', '', true) ->> 'saved', 'true', 'admin: force → tersimpan');

-- ---------- Status ----------
select tests.su();
select tests.put('walk', (select id::text from appointments where source = 'walk_in'));
select tests.login(tests.sari());
select throws_like(format($$ select advance_appointment_status('%s') $$,
                          tests.get('walk')),
                   '%tidak ditemukan%', 'kapster: tidak bisa ubah booking kapster lain');
select tests.login(tests.andi());
select is(advance_appointment_status(tests.get('walk')::uuid)::text, 'arrived',
          'kapster: maju satu langkah');
select tests.login(tests.kasir());
select throws_like(format($$ update appointments set status = 'paid' where id = '%s' $$,
                          tests.get('walk')),
                   '%hanya lewat checkout%', 'paid hanya lewat checkout');

select * from finish();
rollback;
