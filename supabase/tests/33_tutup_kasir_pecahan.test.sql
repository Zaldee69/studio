begin;
\ir helpers.psql
select plan(4);

-- Tutup kasir per pecahan & toleransi selisih.
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date >= jkt_today();
alter table cash_closings enable trigger cash_closings_immutable;

select tests.login(tests.kasir());
select throws_like($$ select save_cash_closing(jkt_today(), 152000, '', 0, '{"100000": 1, "50000": 1}') $$,
  '%tidak sama dengan kas fisik%', 'jumlah per pecahan harus sama dengan kas fisik');
select lives_ok($$ select save_cash_closing(jkt_today(), 152000, '', 0, '{"100000": 1, "50000": 1, "coins": 2000}') $$, 'pecahan + koin = kas fisik → tersimpan');
select tests.login(tests.mgr());
select is((select denominations ->> 'coins' from cash_closings where date = jkt_today()), '2000', 'rincian pecahan tersimpan');
select is((cash_summary(jkt_today()) ->> 'tolerance')::bigint, 2000::bigint, 'toleransi selisih default Rp2.000 ikut rekap');

select * from finish();
rollback;
