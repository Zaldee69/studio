begin;
\ir helpers.psql
select plan(5);

-- Stok masuk mencatat sumber dana; dari laci mengurangi kas diharapkan; semua pembelian masuk arus kas laporan.
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date = jkt_today();
alter table cash_closings enable trigger cash_closings_immutable;
insert into inventory_items (name, kind, unit, unit_cost) values ('Sabun uji', 'consumable', 'botol', 10000) returning id as item \gset

select tests.login(tests.mgr());
select (cash_summary(jkt_today()) ->> 'expected_cash')::bigint as exp0 \gset
select throws_like(format($$ select receive_stock(%L, 2, 15000) $$, :'item'), '%Pilih dibayar dari%', 'sumber dana wajib dipilih');
select lives_ok(format($$ select receive_stock(%L, 2, 15000, p_paid_from => 'laci') $$, :'item'), 'beli 2 × Rp15.000 dari laci');
select is((cash_summary(jkt_today()) ->> 'stock_cash')::bigint, 30000::bigint, 'rekap kasir: pembelian stok dari laci');
select is((cash_summary(jkt_today()) ->> 'expected_cash')::bigint, (:exp0 - 30000)::bigint, 'kas diharapkan berkurang');
select lives_ok(format($$ select receive_stock(%L, 1, 20000, p_paid_from => 'transfer') $$, :'item'), 'beli dari rekening (dana QRIS) tidak menyentuh laci');

select * from finish();
rollback;
