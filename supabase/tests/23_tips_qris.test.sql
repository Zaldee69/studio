begin;
\ir helpers.psql
select plan(8);

-- Tips QRIS: titipan untuk staf, bukan omzet; diserahkan tunai dari laci → kas diharapkan berkurang.
select tests.login(tests.kasir());
select throws_like($$ select checkout(jsonb_build_object('method', 'cash', 'tip', 10000, 'tip_staff_id', tests.staff_andi(),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) $$,
  '%hanya untuk pembayaran QRIS%', 'tips tunai ditolak (tidak dicatat)');
select throws_like($$ select checkout(jsonb_build_object('method', 'qris', 'qris_ref', 'TIP-A1', 'tip', 10000,
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) $$,
  '%staf penerima tips%', 'tips tanpa staf penerima ditolak');

select tests.login(tests.mgr());
select (cash_summary(jkt_today()) ->> 'expected_cash')::bigint as exp0, (cash_summary(jkt_today()) ->> 'qris_sales')::bigint as q0 \gset
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'qris', 'qris_ref', 'TIP-' || gen_random_uuid(), 'tip', 20000, 'tip_staff_id', tests.staff_andi(),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx \gset

select is((select tip_amount from transactions where id = :'tx'), 20000::bigint, 'tips tersimpan terpisah');
select is((select tip_staff_id from transactions where id = :'tx'), tests.staff_andi(), 'untuk staf pilihan kasir');
select is((select total - (select price from services where id = tests.svc('Potong Rambut')) from transactions where id = :'tx'), 0::bigint,
          'tagihan (omzet) tidak termasuk tips');
select is((select sum(net_amount)::bigint from transaction_items where transaction_id = :'tx'), (select total from transactions where id = :'tx'),
          'baris komisi tidak termasuk tips');

select tests.login(tests.mgr());
select is((cash_summary(jkt_today()) ->> 'expected_cash')::bigint, (:exp0 - 20000)::bigint, 'kas diharapkan berkurang sebesar tips (diserahkan tunai dari laci)');
select tests.su();
select ok((owner_finance(jkt_today(), jkt_today()) -> 'payments' ->> 'tips_qris')::bigint >= 20000, 'laporan owner: tips QRIS terpisah dari omzet');

select * from finish();
rollback;
