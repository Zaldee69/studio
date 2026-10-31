begin;
\ir helpers.psql
select plan(5);

-- Audit UANG-3 pilihan B + UANG-5 (1 Nov): void transaksi dari minggu yang komisinya sudah dibayar → potongan, dipotong di
-- bayaran minggu berikutnya; kasbon & potongan terbawa lintas bulan sampai lunas.
select tests.su();
update settings set min_monthly_pay = 0;
insert into staff (id, name, category, commission_pct_override) values ('00000000-0000-0000-00f7-000000000001', 'Uji Void', 'barbershop', 50);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00f7-0000000000a1', 100000, 100000, 100000, 'transfer', jkt('2030-03-05', '10:00')),
  ('00000000-0000-0000-00f7-0000000000a2', 60000, 60000, 60000, 'transfer', jkt('2030-03-13', '10:00')),
  ('00000000-0000-0000-00f7-0000000000a3', 200000, 200000, 200000, 'transfer', jkt('2030-04-02', '10:00'));
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount, commission_pct, commission_deduct_hpp) values
  ('00000000-0000-0000-00f7-0000000000a1', '00000000-0000-0000-00f7-000000000001', 'Potong', 'barbershop', 100000, 100000, 50, false),
  ('00000000-0000-0000-00f7-0000000000a2', '00000000-0000-0000-00f7-000000000001', 'Potong', 'barbershop', 60000, 60000, 50, false),
  ('00000000-0000-0000-00f7-0000000000a3', '00000000-0000-0000-00f7-000000000001', 'Potong', 'barbershop', 200000, 200000, 50, false);
-- minggu 4–10 Mar 2030 sudah ditutup & dibayar (komisi 50.000 dibekukan)
insert into commission_weeks (week_start, status) values ('2030-03-04', 'closed');
insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount, subsidy, kasbon)
values ('2030-03-04', '00000000-0000-0000-00f7-000000000001', '2030-03-01', 1, 100000, 50000, 0, 50000, 0, 0);

select tests.login(tests.mgr());
select lives_ok($$ select void_transaction('00000000-0000-0000-00f7-0000000000a1', 'uji') $$, 'void di minggu yang sudah dibayar tetap bisa');
select tests.su();
select is((select sum(amount) from commission_deductions where transaction_id = '00000000-0000-0000-00f7-0000000000a1'), 50000::numeric,
  'komisi transaksi yang di-void menjadi potongan 50.000');
-- commission_week_rows = fungsi internal (dipanggil sebagai su)
-- kasbon 40.000 tanggal 31 Mar (bulan Maret), staf tidak punya layanan minggu itu → terbawa ke April
insert into expenses (date, category, description, amount, source, staff_id) values ('2030-03-31', 'kasbon', 'uji kasbon', 40000, 'transfer', '00000000-0000-0000-00f7-000000000001');
select is((select kasbon from commission_week_rows('2030-03-11') where staff_id = '00000000-0000-0000-00f7-000000000001'), 30000::bigint,
  'minggu 11 Mar: komisi 30.000 habis untuk potongan void');
-- minggu 11 Mar ditutup dengan potongan 30.000 → sisa utang 20.000 potongan + 40.000 kasbon = 60.000
select tests.su();
insert into commission_weeks (week_start, status) values ('2030-03-11', 'closed');
insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount, subsidy, kasbon)
values ('2030-03-11', '00000000-0000-0000-00f7-000000000001', '2030-03-01', 1, 60000, 30000, 0, 0, 0, 30000);
select results_eq($$ select kasbon, amount from commission_week_rows('2030-04-01') where staff_id = '00000000-0000-0000-00f7-000000000001' $$,
  $$ values (60000::bigint, 40000::bigint) $$, 'April: sisa potongan + kasbon Maret terbawa lintas bulan (100.000 − 60.000)');
select is((select count(*)::int from commission_week_rows('2030-04-01') where staff_id = '00000000-0000-0000-00f7-000000000001'), 1, 'satu baris bayaran');

select * from finish();
rollback;
