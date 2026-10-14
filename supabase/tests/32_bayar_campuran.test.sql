begin;
\ir helpers.psql
select plan(7);

-- Bayar campuran: Potong Rambut, 20rb tunai + sisanya QRIS.
select tests.su();
update transactions set voided_at = now(), void_reason = 'isolasi tes' where created_at >= jkt(jkt_today(), '00:00') and voided_at is null;
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date >= jkt_today();
alter table cash_closings enable trigger cash_closings_immutable;

select tests.login(tests.kasir());
select throws_like($$ select checkout(jsonb_build_object('method', 'cash', 'cash_part', 10000, 'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) $$,
  '%kurang dari tagihan%', 'bagian tunai hanya untuk QRIS/transfer');
select throws_like($$ select checkout(jsonb_build_object('method', 'qris', 'qris_ref', 'CAMPUR0', 'cash_part', 999999, 'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) $$,
  '%kurang dari tagihan%', 'bagian tunai harus kurang dari tagihan');
select checkout(jsonb_build_object('method', 'qris', 'qris_ref', 'CAMPUR' || left(md5(random()::text), 6), 'cash_part', 20000,
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx \gset

select tests.su();
select paid_amount as paid from transactions where id = :'tx' \gset
select tests.login(tests.mgr());
select cash_summary(jkt_today()) as cs \gset
select is((:'cs'::jsonb ->> 'cash_sales')::bigint, 20000::bigint, 'tutup kasir: bagian tunai masuk pemasukan tunai');
select is((:'cs'::jsonb ->> 'qris_sales')::bigint, (:paid - 20000)::bigint, 'tutup kasir: QRIS = sisanya');
select tests.su();
select is(((owner_finance(jkt_today(), jkt_today()) -> 'payments' ->> 'cash')::bigint + (owner_finance(jkt_today(), jkt_today()) -> 'payments' ->> 'qris')::bigint),
          :paid::bigint, 'laporan owner: tunai + QRIS = dibayar');
select is(cash_day_net(jkt_today()), 20000::bigint, 'saldo laci bertambah sebesar bagian tunai');

-- void setelah tutup kasir → refund laci hanya bagian tunai
select tests.login(tests.kasir());
select save_cash_closing(jkt_today(), (:'cs'::jsonb ->> 'expected_cash')::bigint, '', 0);
select tests.login(tests.mgr());
select void_transaction(:'tx', 'uji');
select is((cash_summary(jkt_today() + 1) ->> 'refund_cash')::bigint, 20000::bigint, 'void setelah tutup: refund laci = bagian tunai saja');

select * from finish();
rollback;
