begin;
\ir helpers.psql
select plan(13);

-- Komisi mingguan Senin–Minggu. Staf uji dengan komisi 50% (override) agar angka pasti; tanpa HPP.
select tests.su();
insert into staff (id, name, category, commission_pct_override) values
  ('00000000-0000-0000-00aa-000000000001', 'Uji Minggu A', 'barbershop', 50),
  ('00000000-0000-0000-00aa-000000000002', 'Uji Minggu B', 'barbershop', 50);
-- minggu 28 Sep–4 Okt 2026 (melewati pergantian bulan) untuk A; minggu 21–27 Sep untuk B
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00aa-0000000000a1', 100000, 100000, 100000, 'cash', jkt('2026-09-30', '10:00')),
  ('00000000-0000-0000-00aa-0000000000a2', 60000, 60000, 60000, 'cash', jkt('2026-10-02', '10:00')),
  ('00000000-0000-0000-00aa-0000000000a3', 80000, 80000, 80000, 'cash', jkt('2026-09-23', '10:00'));
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00aa-0000000000a1', '00000000-0000-0000-00aa-000000000001', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00aa-0000000000a2', '00000000-0000-0000-00aa-000000000001', 'Potong', 'barbershop', 60000, 60000),
  ('00000000-0000-0000-00aa-0000000000a3', '00000000-0000-0000-00aa-000000000002', 'Potong', 'barbershop', 80000, 80000);

select tests.login(tests.mgr());
create temp view a as select * from commission_week('2026-10-01') where staff_id = '00000000-0000-0000-00aa-000000000001';
select results_eq($$ select amount, closed from a $$, $$ values (80000::bigint, false) $$, 'live: 50% × (100.000 + 60.000), tanggal mana pun di minggu itu');
select throws_like($$ select commission_week_close(jkt_today()) $$, '%belum selesai%', 'minggu berjalan belum bisa ditutup');

select ok(commission_week_close('2026-09-28') > 0, 'minggu 28 Sep–4 Okt ditutup');
select results_eq($$ select month, amount from commission_week_pays where staff_id = '00000000-0000-0000-00aa-000000000001' order by month $$,
  $$ values ('2026-09-01'::date, 50000::bigint), ('2026-10-01'::date, 30000::bigint) $$, 'dipecah per bulan untuk penyelesaian');
select is((select closed_amount from commission_weekly_for_month('2026-09-01') where staff_id = '00000000-0000-0000-00aa-000000000001'),
          50000::bigint, 'September: 50.000 sudah ditutup mingguan (dikurangkan di akhir bulan)');
select throws_like($$ select commission_week_close('2026-10-01') $$, '%sudah ditutup%', 'tidak bisa ditutup dua kali');

select lives_ok($$ select commission_week_mark_paid('2026-09-28', '00000000-0000-0000-00aa-000000000001', 'transfer') $$, 'tandai dibayar');
select is((select count(*) from commission_week_pays where staff_id = '00000000-0000-0000-00aa-000000000001' and paid_at is not null), 2::bigint,
          'dibayar sekali untuk seluruh minggu (kedua bulan)');
select throws_like($$ select commission_week_reopen('2026-09-28', 'salah') $$, '%Sudah ada yang dibayar%', 'yang sudah dibayar tidak bisa dibuka ulang');

-- bulan ditutup DULU, baru minggunya: transaksi bulan itu tidak ikut lagi (tidak dibayar dobel)
select payroll_close('2026-09-01');
select is(commission_week_close('2026-09-21'), 0, 'minggu 21–27 Sep setelah gaji September ditutup: tidak ada komisi dobel');
select is((select amount from commission_week('2026-09-21') where staff_id = '00000000-0000-0000-00aa-000000000002'), null, 'B tidak dibayar mingguan untuk September');

-- kapster: hanya dirinya; tidak bisa menutup
select tests.login(tests.andi());
select is((select count(*) from commission_week('2026-09-28') where staff_id <> tests.staff_andi()), 0::bigint, 'kapster hanya melihat komisinya sendiri');
select throws_like($$ select commission_week_close('2026-09-14') $$, '%Akses ditolak%', 'kapster tidak bisa menutup minggu');

select * from finish();
rollback;
