begin;
\ir helpers.psql
select plan(7);

-- Pijat: 2 bed, layanan dari pricelist, hanya lewat kasir (tidak online), tidak ikut diskon paket gabungan.
select tests.su();
insert into staff (id, name, category) values ('00000000-0000-0000-00fe-000000000001', 'Terapis Uji', 'massage');

select is((select count(*) from resources where type = 'massage' and active), 2::bigint, '2 bed pijat');
select is((select count(*) from services where category = 'massage' and active and not online_bookable), 1::bigint,
          'pijat bisa dibooking online, kecuali "Tambahan 1 titik bekam" (ditentukan di tempat)');
select ok(exists (select 1 from bookable_categories() c where c = 'massage'), 'pijat ditawarkan di booking publik bila ada bed & terapis aktif');

select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'cash_received', 500000, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong + Cuci + Styling'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Pijat Fullbody'), 'staff_id', '00000000-0000-0000-00fe-000000000001')))) as tx \gset
select is((select discount_amount from transactions where id = :'tx'::uuid), 0::bigint, 'potong + pijat tidak dapat diskon paket');
select is((select category::text from transaction_items where transaction_id = :'tx'::uuid and name = 'Pijat Fullbody'), 'massage',
          'item pijat tercatat berkategori pijat (komisi & laporan)');
select throws_like(format($$ select checkout('{"items":[{"service_id":"%s","staff_id":"%s"}],"method":"cash","cash_received":100000}') $$,
                        tests.svc('Pijat Fullbody'), tests.staff_andi()), '%kategori yang sama%', 'pijat tidak bisa dicatat atas nama kapster barbershop');

select tests.login(tests.mgr());
select ok((kpi_revenue_mix(jkt_today(), jkt_today()) -> 'mix') @> '[{"category": "massage"}]', 'omzet pijat muncul di komposisi omzet');

select * from finish();
rollback;
