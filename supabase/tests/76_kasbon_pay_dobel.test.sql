begin;
\ir helpers.psql
-- AC12 e2e (review PR #17): kasbon lewat kasbon_pay (PR #16, feat/kasbon-approval) tidak dobel potong di commission_live.
-- Bergantung migrasi 20261120000003_kasbon_approval; dilewati bila kasbon_pay belum ada (cabang ini belum digabung dengan #16).
select to_regproc('public.kasbon_pay') is not null as ada \gset
\if :ada
select plan(4);
select tests.su();
update profiles set role = 'manager', active = true where id = tests.mgr();
update settings set kasbon_approver = tests.mgr(), kasbon_flow_on = true, kasbon_weekly_limit = 1000000, min_monthly_pay = 0;   -- su: bootstrap
insert into staff (id, name, category, commission_pct_override, base_salary, pay_monthly)
  values ('00000000-0000-0000-00ee-0000000000f1', 'Uji Kasbon Bayar', 'barbershop', 50, null, false);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at)
  values ('00000000-0000-0000-00ee-0000000000f2', 100000, 100000, 100000, 'cash', jkt(jkt_today(), '10:00'));
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount)
  values ('00000000-0000-0000-00ee-0000000000f2', '00000000-0000-0000-00ee-0000000000f1', 'Potong', 'barbershop', 100000, 100000);

select tests.login(tests.mgr());
select kasbon_request('00000000-0000-0000-00ee-0000000000f1', 70000, 'uji ac12') as r \gset
select kasbon_decide(:'r'::uuid, true);
select tests.su();
insert into storage.objects (bucket_id, name) values ('receipts', 'kasbon/' || :'r' || '/bukti.jpg');
select tests.login(tests.mgr());
select kasbon_pay(:'r'::uuid, 'kasbon/' || :'r' || '/bukti.jpg') as e \gset
select tests.su();

select is((select count(*) from payroll_adjustments a where a.staff_id = '00000000-0000-0000-00ee-0000000000f1' and a.amount = -70000
           and a.id = (select adjustment_id from expenses where id = :'e'))::int, 1, 'AC12: baris payroll_adjustments kasbon tetap ada (jejak)');
select results_eq($$ select adjustments from commission_live(date_trunc('month', jkt_today())::date) where staff_id = '00000000-0000-0000-00ee-0000000000f1' $$,
  $$ values (0::bigint) $$, 'AC12: commission_live.adjustments = 0 (tak dobel dengan potongan mingguan)');
select results_eq($$ select total_pay from commission_live(date_trunc('month', jkt_today())::date) where staff_id = '00000000-0000-0000-00ee-0000000000f1' $$,
  $$ values (50000::bigint) $$, 'AC12: total_pay = komisi 50rb, kasbon 70rb tak mengurangi');
select is((select amount from expenses where id = :'e')::bigint, 70000::bigint, 'AC12: expenses kasbon 70rb (utang dibawa komisi mingguan)');
\else
select plan(1);
select skip('kasbon_pay tidak ada (butuh migrasi PR #16 feat/kasbon-approval)', 1);
\endif
select * from finish();
rollback;
