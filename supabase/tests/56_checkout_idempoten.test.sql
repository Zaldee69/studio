begin;
\ir helpers.psql
select plan(4);

-- Audit UANG-7 (1 Nov): checkout dengan client_request_id yang sama tidak membuat transaksi kedua.
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'client_request_id', 'uji-idem-0001',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx1 \gset
select checkout(jsonb_build_object('method', 'cash', 'client_request_id', 'uji-idem-0001',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx2 \gset
select is(:'tx2'::uuid, :'tx1'::uuid, 'kirim ulang dengan id sama → transaksi yang sama');
select tests.su();
select is((select count(*)::int from transactions where client_request_id = 'uji-idem-0001'), 1, 'hanya satu transaksi tersimpan');

select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'client_request_id', 'uji-idem-0002',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx3 \gset
select isnt(:'tx3'::uuid, :'tx1'::uuid, 'id berbeda → transaksi baru');
select checkout(jsonb_build_object('method', 'cash',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx4 \gset
select ok(:'tx4'::uuid is not null, 'tanpa id (klien lama) tetap bisa bayar');

select * from finish();
rollback;
