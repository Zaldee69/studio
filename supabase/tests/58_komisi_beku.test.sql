begin;
\ir helpers.psql
select plan(4);

-- Audit UANG-4 (1 Nov): aturan komisi dibekukan per item saat bayar — ubah persen/potong HPP tidak mengubah komisi lama.
select tests.su();
update staff set commission_pct_override = 50, deduct_hpp = false where id = tests.staff_andi();
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx \gset
select tests.su();
select is((select commission_pct from transaction_items where transaction_id = :'tx'), 50::numeric, 'persen komisi tersimpan di item saat bayar');
select commission into temp c0 from commission_lines(jkt_today()) where transaction_id = :'tx';

update staff set commission_pct_override = 30, deduct_hpp = true where id = tests.staff_andi();
select is((select commission from commission_lines(jkt_today()) where transaction_id = :'tx'), (select commission from c0),
  'ubah persen & potong HPP sesudahnya: komisi transaksi lama tetap');

select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash',
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx2 \gset
select tests.su();
select results_eq(format($$ select commission_pct, commission_deduct_hpp from transaction_items where transaction_id = '%s' $$, :'tx2'),
  $$ values (30::numeric, true) $$, 'transaksi baru memakai aturan baru');
select ok((select commission from commission_lines(jkt_today()) where transaction_id = :'tx2') <= (select commission from c0),
  'komisi transaksi baru dihitung dengan 30% − HPP');

select * from finish();
rollback;
