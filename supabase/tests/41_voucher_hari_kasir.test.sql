begin;
\ir helpers.psql
select plan(14);

-- Voucher Senin–Kamis (rapat 26 Okt): hari dicek terhadap tanggal jadwal (booking) / hari ini (kasir);
-- kasir bisa memasukkan kode untuk walk-in; 1× per pelanggan & kuota ikut menghitung pemakaian kasir.
select tests.su();
update settings set online_promo_pct = 0;
select extract(isodow from jkt_today())::int as dow \gset
insert into vouchers (code, kind, value, category, quota, once_per_customer, weekdays) values
  ('SENKAM', 'pct', 10, 'barbershop', null, true, '1234'),
  ('HARIINI', 'amount', 5000, null, 2, true, :'dow'::text),
  ('BUKANHARIINI', 'amount', 5000, null, null, false, ((:dow % 7) + 1)::text);
select tests.svc('Potong Rambut') as potong \gset
select jkt_today() + ((8 - :dow) % 7) as senin, jkt_today() + ((13 - :dow) % 7) as sabtu \gset
insert into customers (id, name, whatsapp) values
  ('00000000-0000-0000-00ef-000000000001', 'Walk-in Satu', '6281299991001'),
  ('00000000-0000-0000-00ef-000000000002', 'Walk-in Dua', '6281299991002'),
  ('00000000-0000-0000-00ef-000000000003', 'Walk-in Tiga', '6281299991003');

select is(voucher_days_label('1234'), 'Senin–Kamis', 'label hari berurutan');
select is(voucher_days_label('67'), 'Sabtu, Minggu', 'label dua hari');
select is((voucher_check('SENKAM', array[:'potong'::uuid], null, :'senin') ->> 'ok')::boolean, true, 'jadwal Senin → berlaku');
select is(voucher_check('SENKAM', array[:'potong'::uuid], null, :'sabtu') ->> 'message',
  'Voucher ini hanya berlaku hari Senin–Kamis — pilih jadwal di hari tersebut', 'jadwal Sabtu → ditolak dengan alasan jelas');
select is(voucher_preview('SENKAM', array[:'potong'::uuid], '', :'sabtu') ->> 'ok', 'false', 'pratinjau booking memakai tanggal jadwal');
select is(book_online(jsonb_build_object('date', :'sabtu', 'time', '10:00', 'service_ids', jsonb_build_array(:'potong'), 'together', true,
  'name', 'Uji Senkam', 'whatsapp', '081299991009', 'voucher_code', 'SENKAM', 'client_request_id', 'vch-hari-0001')) ->> 'code',
  'voucher', 'booking Sabtu dengan voucher Senin–Kamis ditolak');

-- ---------- kasir ----------
select tests.login(tests.kasir());
select ok((voucher_check_kasir('BUKANHARIINI', array[:'potong'::uuid]) ->> 'message') like 'Voucher ini hanya berlaku hari %', 'kasir: di luar hari berlaku ditolak');
select ok((voucher_check_kasir('HARIINI', array[:'potong'::uuid]) ->> 'message') like 'Voucher ini 1× per pelanggan%', 'kasir: 1× per pelanggan butuh data pelanggan');
select throws_like(format($$ select checkout(jsonb_build_object('method', 'cash', 'voucher_code', 'HARIINI',
  'items', jsonb_build_array(jsonb_build_object('service_id', '%s', 'staff_id', '%s')))) $$, :'potong', tests.staff_andi()),
  '%1× per pelanggan%', 'checkout walk-in tanpa pelanggan ditolak');
select checkout(jsonb_build_object('method', 'cash', 'voucher_code', 'hariini', 'customer_id', '00000000-0000-0000-00ef-000000000001',
  'items', jsonb_build_array(jsonb_build_object('service_id', :'potong', 'staff_id', tests.staff_andi())))) as tx1 \gset
select tests.su();
select results_eq(format($$ select discount_amount, discount_label, voucher_id = (select id from vouchers where code = 'HARIINI') from transactions where id = '%s' $$, :'tx1'),
  $$ values (5000::bigint, 'Voucher HARIINI'::text, true) $$, 'walk-in: potongan & voucher tercatat di transaksi');

select tests.login(tests.kasir());
select is(voucher_check_kasir('HARIINI', array[:'potong'::uuid], '00000000-0000-0000-00ef-000000000001') ->> 'message',
  'Voucher ini sudah pernah dipakai dengan nomor ini', 'pemakaian di kasir dihitung untuk 1× per pelanggan');
select checkout(jsonb_build_object('method', 'cash', 'voucher_code', 'HARIINI', 'customer_id', '00000000-0000-0000-00ef-000000000002',
  'items', jsonb_build_array(jsonb_build_object('service_id', :'potong', 'staff_id', tests.staff_andi()))));
select is(voucher_check_kasir('HARIINI', array[:'potong'::uuid], '00000000-0000-0000-00ef-000000000003') ->> 'message',
  'Kuota voucher sudah habis', 'kuota 2 habis oleh pemakaian kasir');
select tests.login(tests.mgr());
select is((select reserved from voucher_usage() where voucher_id = (select id from vouchers where code = 'HARIINI')), 2, 'layar manajer: kuota terpakai 2');

select tests.anon();
select throws_like($$ select voucher_check_kasir('HARIINI', array[]::uuid[]) $$, '%permission denied%', 'tamu tidak bisa memakai cek voucher kasir');

select * from finish();
rollback;
