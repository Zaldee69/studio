begin;
\ir helpers.psql
select plan(5);

-- Kejadian 15/10: listrik dibayar dari laci tapi lupa dicatat → tutup kasir selisih −307.000.
-- Koreksi: manajer mencatat pengeluaran laci ke tanggal itu lalu menutup ulang dengan hitungan fisik yang sama → selisih 0.
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date >= jkt_today();
alter table cash_closings enable trigger cash_closings_immutable;
update transactions set voided_at = now(), void_reason = 'isolasi tes' where created_at >= jkt(jkt_today(), '00:00') and voided_at is null;
delete from expenses where date >= jkt_today();
update settings set drawer_start_date = jkt_today(), drawer_start_balance = 627000;
select tests.login(tests.mgr());
select (cash_summary(jkt_today()) ->> 'expected_cash')::bigint - 307000 as phys \gset

select tests.login(tests.kasir());
select save_cash_closing(jkt_today(), :phys, '', 0);
select tests.login(tests.mgr());
select is((select difference from cash_closings where date = jkt_today()), -307000::bigint, 'tutup kasir: selisih −307.000');

select tests.login(tests.kasir());
select throws_like($$ select add_expense(jkt_today(), 'konsumsi', 'Air', 20000, 'laci') $$,
  '%sudah ditutup%', 'kasir tidak bisa menambah pengeluaran laci ke tanggal yang sudah ditutup');
select tests.login(tests.mgr());
select lives_ok($$ select add_expense(jkt_today(), 'listrik_air', 'Listrik', 307000, 'laci', 'expenses/nota.jpg') $$,
  'manajer mencatat pengeluaran laci yang terlewat');
select save_cash_closing(jkt_today(), :phys, 'Koreksi: listrik 307.000 dari laci belum tercatat', 0);
select is((select difference from cash_closings where date = jkt_today() and note like 'Koreksi%'), 0::bigint,
  'tutup ulang dengan hitungan fisik yang sama → selisih 0');
select tests.su();
select is(drawer_opening(jkt_today() + 1), :phys::bigint, -- semua penutupan memakai hitungan fisik yang sama
  'saldo awal laci berikutnya tetap = uang fisik');

select * from finish();
rollback;
