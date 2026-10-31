begin;
\ir helpers.psql
select plan(8);

-- Skema per staf: N (gaji pokok 3 jt, 30% setelah HPP, ritel 10%, bayar bulanan) vs L (ikut global: 50%, tanpa potong HPP,
-- ritel 0%, jaring bulanan 1,2 jt, bayar mingguan). Masing-masing: jasa 100rb (HPP 10rb) + ritel 50rb.
select tests.su();
update settings set commission_pct = 50, commission_deduct_hpp = false, retail_commission_pct = 0, min_monthly_pay = 1200000, commission_basis = 'net';
insert into staff (id, name, category, commission_pct_override, base_salary, pay_monthly, deduct_hpp, retail_pct_override) values
  ('00000000-0000-0000-00dd-000000000001', 'Uji Bulanan N', 'barbershop', 30, 3000000, true, true, 10),
  ('00000000-0000-0000-00dd-000000000002', 'Uji Mingguan L', 'barbershop', null, null, false, null, null);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00dd-0000000000a1', 150000, 150000, 150000, 'cash', jkt('2026-08-04', '10:00')),
  ('00000000-0000-0000-00dd-0000000000a2', 150000, 150000, 150000, 'cash', jkt('2026-08-04', '11:00'));
insert into transaction_items (id, transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00dd-0000000000b1', '00000000-0000-0000-00dd-0000000000a1', '00000000-0000-0000-00dd-000000000001', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000b2', '00000000-0000-0000-00dd-0000000000a1', '00000000-0000-0000-00dd-000000000001', 'Pomade', 'retail', 50000, 50000),
  ('00000000-0000-0000-00dd-0000000000b3', '00000000-0000-0000-00dd-0000000000a2', '00000000-0000-0000-00dd-000000000002', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000b4', '00000000-0000-0000-00dd-0000000000a2', '00000000-0000-0000-00dd-000000000002', 'Pomade', 'retail', 50000, 50000);
insert into transaction_item_costs (transaction_item_id, hpp) values
  ('00000000-0000-0000-00dd-0000000000b1', 10000), ('00000000-0000-0000-00dd-0000000000b3', 10000);

select results_eq($$ select base_salary, commission_service, commission_retail, subsidy, total_pay from commission_live('2026-08-01')
                     where staff_id = '00000000-0000-0000-00dd-000000000001' $$,
  $$ values (3000000::bigint, 27000::bigint, 5000::bigint, 0::bigint, 3032000::bigint) $$,
  'N: gaji pokok + 30% × (100rb − HPP 10rb) + ritel 10%, tanpa jaring pengaman');
select results_eq($$ select base_salary, commission_service, commission_retail, subsidy, total_pay from commission_live('2026-08-01')
                     where staff_id = '00000000-0000-0000-00dd-000000000002' $$,
  $$ values (0::bigint, 50000::bigint, 0::bigint, 0::bigint, 50000::bigint) $$,
  'L: tetap skema global (HPP tidak dipotong, ritel 0%); jaring bulanan sudah dihapus (1 Nov)');

select tests.login(tests.mgr());
select is((select count(*) from commission_week('2026-08-03') where staff_id = '00000000-0000-0000-00dd-000000000001'), 0::bigint,
  'N bayar bulanan: tidak muncul di komisi mingguan');
select is((select amount from commission_week('2026-08-03') where staff_id = '00000000-0000-0000-00dd-000000000002'), 50000::bigint,
  'L tetap di komisi mingguan');
select ok(commission_week_close('2026-08-03') > 0, 'minggu ditutup');
select is((select count(*) from commission_week_pays where staff_id = '00000000-0000-0000-00dd-000000000001'), 0::bigint,
  'tutup minggu tidak membekukan bayaran N');
select ok(payroll_close('2026-08-01') > 0, 'periode Agustus ditutup');
select results_eq($$ select base_salary, total_pay, closed from commission_for_period('2026-08-01', '00000000-0000-0000-00dd-000000000001') $$,
  $$ values (3000000::bigint, 3032000::bigint, true) $$, 'slip beku menyimpan gaji pokok');

select * from finish();
rollback;
