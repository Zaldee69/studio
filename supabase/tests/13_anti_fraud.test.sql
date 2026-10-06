begin;
\ir helpers.psql
select plan(16);

-- tanggal uji tanpa penutupan (data lain di DB lokal tak mengganggu)
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date = jkt_today();
alter table cash_closings enable trigger cash_closings_immutable;
insert into customers (id, name) values ('00000000-0000-0000-00ff-000000000001', 'Uji Fraud');
grant execute on all functions in schema tests to authenticated;

-- ---------- 1. Top-up ----------
select tests.login(tests.kasir());
create temp table t1 as select topup_deposit('00000000-0000-0000-00ff-000000000001', 'cash', null, 100000, 1000000) as id;
select tests.su();
select is((select amount_credited from deposit_topups where id = (select id from t1)), 100000::bigint,
          'kasir: top-up tanpa paket → saldo = uang dibayar (bonus manual diabaikan)');
select is((select created_by from deposit_topups where id = (select id from t1)), tests.kasir(), 'top-up mencatat kasir');
select tests.login(tests.mgr());
create temp table t2 as select topup_deposit('00000000-0000-0000-00ff-000000000001', 'cash', null, 100000, 110000) as id;
select tests.su();
select is((select amount_credited from deposit_topups where id = (select id from t2)), 110000::bigint, 'manajer boleh beri bonus manual');
select tests.login(tests.mgr());
select throws_like($$ select topup_deposit('00000000-0000-0000-00ff-000000000001', 'cash', null, 100000, 50000) $$,
                   '%tidak boleh kurang%', 'saldo < dibayar ditolak');

-- ---------- 2. Tutup kasir buta ----------
select tests.login(tests.kasir());
select ok(cash_summary(jkt_today()) ->> 'expected_cash' is null and (cash_summary(jkt_today()) ->> 'blind')::boolean,
          'kasir belum menutup: kas diharapkan disembunyikan');
select ok(cash_summary(jkt_today()) ? 'tx_count', 'jumlah transaksi tetap terlihat');
select throws_like($$ select cash_summary_full(jkt_today()) $$, '%permission denied%', 'rekap penuh tidak bisa dipanggil langsung');
select lives_ok($$ select save_cash_closing(jkt_today(), 123000, 'uji') $$, 'kasir menutup kas');
select ok(cash_summary(jkt_today()) ->> 'expected_cash' is not null, 'setelah ditutup: kas diharapkan & selisih tampil');
select throws_like($$ select save_cash_closing(jkt_today(), 999000) $$, '%sudah ditutup%', 'kasir tidak bisa menutup ulang');
select throws_like($$ select save_cash_closing(jkt_today() - 7, 1000) $$, '%hari ini atau kemarin%', 'kasir tidak bisa menutup tanggal lain');
select tests.login(tests.mgr());
select lives_ok($$ select save_cash_closing(jkt_today(), 124000, 'koreksi manajer') $$, 'manajer boleh koreksi');

-- ---------- 3. Pelanggan & booking ----------
select tests.su();
insert into customers (id, name) values ('00000000-0000-0000-00ff-000000000002', 'Uji Hapus');
create temp table appt_before as select id, status from appointments;
grant select on appt_before to authenticated;
select tests.login(tests.kasir());
delete from customers where id = '00000000-0000-0000-00ff-000000000002';
update appointments set status = 'cancelled';
select tests.su();
select ok(exists (select 1 from customers where id = '00000000-0000-0000-00ff-000000000002'), 'kasir tidak bisa menghapus pelanggan');
select ok(not exists (select 1 from appointments a join appt_before b using (id) where a.status is distinct from b.status),
          'kasir tidak bisa mengubah booking langsung (tanpa RPC & alasan)');

-- ---------- 4. Kapster item = kapster booking ----------
select tests.su();
insert into appointments (id, resource_id, staff_id, start_at, duration_min, source)
select '00000000-0000-0000-00ff-0000000000a1', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(),
       jkt(jkt_today() + 3, '10:00'), 45, 'admin';
create temp table other_barber as select id from staff where category = 'barbershop' and id <> tests.staff_andi() and active limit 1;
grant select on other_barber to authenticated;
select tests.login(tests.kasir());
select throws_like(format($$ select checkout('{"method":"cash","items":[{"service_id":"%s","appointment_id":"00000000-0000-0000-00ff-0000000000a1","staff_id":"%s"}]}') $$,
                          tests.svc('Potong Rambut'), (select id from other_barber)),
                   '%berbeda dengan booking%', 'komisi tidak bisa dialihkan ke kapster lain di kasir');
select lives_ok(format($$ select checkout('{"method":"cash","items":[{"service_id":"%s","appointment_id":"00000000-0000-0000-00ff-0000000000a1"}]}') $$,
                       tests.svc('Potong Rambut')), 'kapster sesuai booking → lunas');

select * from finish();
rollback;
