begin;
\ir helpers.psql
select plan(7);

-- Kasbon dipotong di komisi mingguan. Staf K (komisi 50%), jaring bulanan 0 agar angka pasti.
-- Komisi 50rb/minggu; kasbon 70rb (4 Agu) → minggu 1 dipotong 50rb (bayaran 0), minggu 2 sisa 20rb (bayaran 30rb).
select tests.su();
update settings set min_monthly_pay = 0;
insert into staff (id, name, category, commission_pct_override) values ('00000000-0000-0000-00cc-000000000001', 'Uji Kasbon K', 'barbershop', 50);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00cc-0000000000a1', 100000, 100000, 100000, 'cash', jkt('2026-08-03', '10:00')),
  ('00000000-0000-0000-00cc-0000000000a2', 100000, 100000, 100000, 'cash', jkt('2026-08-11', '10:00'));
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00cc-0000000000a1', '00000000-0000-0000-00cc-000000000001', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00cc-0000000000a2', '00000000-0000-0000-00cc-000000000001', 'Potong', 'barbershop', 100000, 100000);
with a as (insert into payroll_adjustments (staff_id, month, kind, amount, reason)
           values ('00000000-0000-0000-00cc-000000000001', '2026-08-01', 'deduction', -70000, 'Kasbon 04/08: uji') returning id)
insert into expenses (date, category, description, amount, source, staff_id, adjustment_id)
select '2026-08-04', 'kasbon', 'uji', 70000, 'laci', '00000000-0000-0000-00cc-000000000001', a.id from a;

select tests.login(tests.mgr());
create temp view k1 as select kasbon, amount from commission_week('2026-08-03') where staff_id = '00000000-0000-0000-00cc-000000000001';
select results_eq($$ select * from k1 $$, $$ values (50000::bigint, 0::bigint) $$, 'live: kasbon dipotong maksimal sebesar bayaran minggu itu');
select ok(commission_week_close('2026-08-03') > 0, 'minggu 1 ditutup');
select results_eq($$ select kasbon, amount from commission_week_pays where staff_id = '00000000-0000-0000-00cc-000000000001' $$,
  $$ values (50000::bigint, 0::bigint) $$, 'potongan kasbon dibekukan');
select results_eq($$ select kasbon, amount from commission_week('2026-08-10') where staff_id = '00000000-0000-0000-00cc-000000000001' $$,
  $$ values (20000::bigint, 30000::bigint) $$, 'minggu 2: sisa kasbon 20rb dipotong');
select ok(commission_week_close('2026-08-10') > 0, 'minggu 2 ditutup');

select tests.su();
select is((select total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00cc-000000000001')
          - (select sum(amount) from commission_week_pays where staff_id = '00000000-0000-0000-00cc-000000000001')::bigint,
          0::bigint, 'akhir bulan: kasbon tidak terpotong dua kali (sisa 0)');
-- reopen minggu 2 → potongannya kembali dihitung ulang
select tests.login(tests.mgr());
select commission_week_reopen('2026-08-10', 'uji');
select results_eq($$ select kasbon from commission_week('2026-08-10') where staff_id = '00000000-0000-0000-00cc-000000000001' $$,
  $$ values (20000::bigint) $$, 'buka ulang: sisa kasbon tetap 20rb (minggu 1 tetap terpotong)');

select * from finish();
rollback;
