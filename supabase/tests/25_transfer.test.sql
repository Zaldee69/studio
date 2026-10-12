begin;
\ir helpers.psql
select plan(9);

-- Bayar transfer bank: wajib No. referensi unik, tidak masuk kas diharapkan, terpisah di rekap & laporan; tips boleh.
select tests.login(tests.mgr());
select (cash_summary(jkt_today()) ->> 'expected_cash')::bigint as exp0, (cash_summary(jkt_today()) ->> 'transfer_sales')::bigint as tr0 \gset
select tests.login(tests.kasir());
select throws_like($$ select checkout(jsonb_build_object('method', 'transfer',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) $$,
  '%referensi transfer%', 'transfer tanpa No. referensi ditolak');
select checkout(jsonb_build_object('method', 'transfer', 'qris_ref', 'trf-' || left(gen_random_uuid()::text, 8), 'tip', 10000, 'tip_staff_id', tests.staff_andi(),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx \gset
select is((select payment_method::text from transactions where id = :'tx'), 'transfer', 'metode tersimpan sebagai transfer');
select ok((select qris_ref from transactions where id = :'tx') ~ '^TRF[A-Z0-9]+$', 'No. referensi dinormalkan (huruf besar, tanpa spasi/strip)');
select throws_like(format($$ select checkout(jsonb_build_object('method', 'qris', 'qris_ref', %L,
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Cukur Jenggot'), 'staff_id', tests.staff_andi())))) $$,
  (select qris_ref from transactions where id = :'tx')), '%sudah dipakai%', 'No. referensi tidak bisa dipakai ulang (lintas QRIS/transfer)');

select tests.login(tests.mgr());
select is((cash_summary(jkt_today()) ->> 'transfer_sales')::bigint - :tr0, (select paid_amount from transactions where id = :'tx'),
          'rekap kasir: penjualan transfer terpisah');
select is((cash_summary(jkt_today()) ->> 'expected_cash')::bigint, (:exp0 - 10000)::bigint,
          'kas diharapkan tidak bertambah (hanya berkurang tips yang diserahkan tunai)');
select tests.su();
select ok((owner_finance(jkt_today(), jkt_today()) -> 'payments' ->> 'transfer')::bigint >= (select paid_amount from transactions where id = :'tx'),
          'laporan owner: uang masuk transfer terpisah');

-- top-up deposit lewat transfer
insert into customers (name, whatsapp) values ('Uji Transfer', '6289900004444') returning id as cid \gset
select tests.login(tests.kasir());
select throws_like(format($$ select topup_deposit(%L, 'transfer', (select id from deposit_packages where active order by amount_paid limit 1)) $$, :'cid'),
  '%referensi transfer%', 'top-up transfer tanpa No. referensi ditolak');
select lives_ok(format($$ select topup_deposit(%L, 'transfer', (select id from deposit_packages where active order by amount_paid limit 1), p_qris_ref => 'TOPUPTRF%s') $$,
  :'cid', left(md5(random()::text), 6)), 'top-up deposit lewat transfer');

select * from finish();
rollback;
