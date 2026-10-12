begin;
\ir helpers.psql
select plan(6);

-- Saldo laci berjalan: kasir menghitung seluruh isi laci; sisa (isi − setoran) jadi saldo awal berikutnya.
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable; -- dibatalkan di akhir (rollback)
delete from cash_closings where date >= jkt_today() - 3;
alter table cash_closings enable trigger cash_closings_immutable; -- tes berdiri sendiri (dibatalkan di akhir)
update settings set drawer_start_date = jkt_today() - 2, drawer_start_balance = 502000;
select tests.login(tests.mgr());

select is((cash_summary(jkt_today() - 2) ->> 'opening_cash')::bigint, 502000::bigint, 'hari mulai: saldo awal dari Pengaturan');
select is((cash_summary(jkt_today() - 3) ->> 'opening_cash')::bigint, 0::bigint, 'sebelum tanggal mulai: tanpa saldo awal (riwayat tidak berubah)');

-- tutup H-2: isi laci 602.000, setor 300.000 → sisa 302.000
select save_cash_closing(jkt_today() - 2, (cash_summary(jkt_today() - 2) ->> 'expected_cash')::bigint + 100000, '', 300000);
select is((select difference from cash_closings where date = jkt_today() - 2), 100000::bigint, 'selisih dihitung dari isi laci vs saldo awal + arus tunai');
select is((cash_summary(jkt_today() - 1) ->> 'opening_cash')::bigint,
          (select physical_cash - deposit_out from cash_closings where date = jkt_today() - 2),
          'hari berikutnya: saldo awal = isi laci − setoran');
-- H-1 tidak ditutup → arus tunainya tetap di laci untuk hari ini
select tests.su(); select cash_day_net(jkt_today() - 1) as net1 \gset
select tests.login(tests.mgr());
select is((cash_summary(jkt_today()) ->> 'opening_cash')::bigint,
          (select physical_cash - deposit_out from cash_closings where date = jkt_today() - 2) + :net1,
          'hari yang tidak ditutup: arus tunainya ikut ke saldo awal');
select throws_like($$ select save_cash_closing(jkt_today(), 1000, '', 2000) $$, '%melebihi isi laci%', 'setoran tidak boleh melebihi isi laci');

select * from finish();
rollback;
