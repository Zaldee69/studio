begin;
\ir helpers.psql
select plan(23);

-- T-01900551 (Opsi A): kasbon staf non-bulanan hanya dipotong lewat komisi mingguan (dibawa lintas bulan);
-- commission_live (gaji bulanan) tak lagi memuat adjustment kasbon mereka. pay_monthly tetap lewat adjustments.
-- Staf: A non-bulanan komisi-saja | B non-bulanan bergaji pokok | C pay_monthly bergaji pokok | D non-bulanan (void setelah dipotong).
-- Komisi 50%: tiap staf 100rb net → 50rb. Kasbon via add_expense (jalur nyata: expenses + payroll_adjustments tertaut).
select tests.su();
update settings set min_monthly_pay = 0;
insert into staff (id, name, category, commission_pct_override, base_salary, pay_monthly) values
  ('00000000-0000-0000-00dd-000000000001', 'Uji Dobel A', 'barbershop', 50, null, false),
  ('00000000-0000-0000-00dd-000000000002', 'Uji Dobel B', 'barbershop', 50, 1000000, false),
  ('00000000-0000-0000-00dd-000000000003', 'Uji Dobel C', 'barbershop', 50, 1000000, true),
  ('00000000-0000-0000-00dd-000000000004', 'Uji Dobel D', 'barbershop', 50, null, false);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at)
select ('00000000-0000-0000-00dd-0000000000a' || i)::uuid, 100000, 100000, 100000, 'cash', jkt(d, '10:00')
from (values (1, '2026-08-03'::date), (2, '2026-08-03'), (3, '2026-08-03'), (4, '2026-08-03'), (5, '2026-09-07')) v(i, d);
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00dd-0000000000a1', '00000000-0000-0000-00dd-000000000001', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000a2', '00000000-0000-0000-00dd-000000000002', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000a3', '00000000-0000-0000-00dd-000000000003', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000a4', '00000000-0000-0000-00dd-000000000004', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000a5', '00000000-0000-0000-00dd-000000000001', 'Potong', 'barbershop', 100000, 100000);

select tests.login(tests.mgr());
select add_expense('2026-08-04', 'kasbon', 'uji A', 70000, 'kas_toko', null, '00000000-0000-0000-00dd-000000000001');
select add_expense('2026-08-04', 'kasbon', 'uji B', 70000, 'kas_toko', null, '00000000-0000-0000-00dd-000000000002');
select add_expense('2026-08-04', 'kasbon', 'uji C', 70000, 'kas_toko', null, '00000000-0000-0000-00dd-000000000003');
select add_expense('2026-08-04', 'kasbon', 'uji D', 40000, 'kas_toko', null, '00000000-0000-0000-00dd-000000000004') as ed \gset
select add_expense('2026-08-05', 'kasbon', 'uji A2 (akan di-void)', 30000, 'kas_toko', null, '00000000-0000-0000-00dd-000000000001') as ea2 \gset
select payroll_add_adjustment('00000000-0000-0000-00dd-000000000001', '2026-08-01', 'bonus', 25000, 'bonus uji');   -- AC6

-- AC1: A (non-bulanan): adjustment kasbon tidak masuk total_pay. Kasbon 70rb > komisi 50rb.
select tests.su();
select results_eq($$ select adjustments, total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00dd-000000000001' $$,
  $$ values (25000::bigint, 75000::bigint) $$, 'AC1/6: A hanya bonus 25rb di adjustments; kasbon 70rb tak mengurangi total_pay');
-- AC2: B bergaji pokok: kasbon tak memotong gaji pokok
select results_eq($$ select base_salary, adjustments, total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00dd-000000000002' $$,
  $$ values (1000000::bigint, 0::bigint, 1050000::bigint) $$, 'AC2: B gaji pokok utuh, adjustments 0');
-- AC3: C pay_monthly: perilaku lama (kasbon memotong lewat adjustments)
select results_eq($$ select adjustments, total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00dd-000000000003' $$,
  $$ values (-70000::bigint, 980000::bigint) $$, 'AC3: C pay_monthly tetap dipotong kasbon 70rb lewat adjustments');
select is((select count(*) from payroll_adjustments where staff_id = '00000000-0000-0000-00dd-000000000001' and reason like 'Kasbon%')::int, 2,
  'baris payroll_adjustments kasbon tetap ada (jejak, tidak dihapus)');

-- AC5 (void sebelum dipotong): kasbon A2 30rb di-void → expenses turun, adjustments net 0, total_pay A tetap
select tests.login(tests.mgr());
select void_expense(:'ea2'::uuid, 'uji batal');
select tests.su();
select results_eq($$ select adjustments, total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00dd-000000000001' $$,
  $$ values (25000::bigint, 75000::bigint) $$, 'AC5: void sebelum dipotong → total_pay A tak berubah (tak jadi +30rb)');
select is((select coalesce(sum(amount), 0) from expenses where staff_id = '00000000-0000-0000-00dd-000000000001' and category = 'kasbon' and voided_at is null)::bigint,
  70000::bigint, 'AC5: utang A = 70rb setelah void A2');

-- Komisi mingguan: minggu 1 ditutup → kasbon dipotong 50rb (bayaran 0), sisa 20rb dibawa
select tests.login(tests.mgr());
select ok(commission_week_close('2026-08-03') > 0, 'minggu 1 (3 Agu) ditutup');
select results_eq($$ select staff_id::text, kasbon, amount from commission_week_pays where week_start = '2026-08-03'
                     and staff_id in ('00000000-0000-0000-00dd-000000000001', '00000000-0000-0000-00dd-000000000002', '00000000-0000-0000-00dd-000000000004') order by staff_id $$,
  $$ values ('00000000-0000-0000-00dd-000000000001', 50000::bigint, 0::bigint), ('00000000-0000-0000-00dd-000000000002', 50000::bigint, 0::bigint),
            ('00000000-0000-0000-00dd-000000000004', 40000::bigint, 10000::bigint) $$, 'AC8: jalur mingguan tak berubah (A,B dipotong 50rb; D 40rb)');
select is((select count(*) from commission_week_pays where staff_id = '00000000-0000-0000-00dd-000000000003')::int, 0, 'AC8: pay_monthly tetap di luar jalur mingguan');

-- AC1 lintas bulan: Sep, sisa 20rb dibawa ke komisi minggu 7 Sep (bukan dipotong di gaji bulanan Agu/Sep)
select ok(commission_week_close('2026-09-07') > 0, 'minggu 7 Sep ditutup');
select results_eq($$ select kasbon, amount from commission_week_pays where week_start = '2026-09-07' and staff_id = '00000000-0000-0000-00dd-000000000001' $$,
  $$ values (20000::bigint, 30000::bigint) $$, 'AC1: sisa kasbon 20rb dibawa lintas bulan, bayaran 30rb');
select tests.su();
select results_eq($$ select adjustments, total_pay from commission_live('2026-09-01') where staff_id = '00000000-0000-0000-00dd-000000000001' $$,
  $$ values (0::bigint, 50000::bigint) $$, 'AC1: Sep A tanpa adjustments kasbon, total_pay = komisi');

-- AC4: invarian per staf: Σ potong mingguan + Σ potong bulanan efektif + sisa utang = Σ kasbon non-void
create temp view inv as
select s.id, s.pay_monthly,
  (select coalesce(sum(kasbon), 0) from commission_week_pays p where p.staff_id = s.id) as pays,
  -((select coalesce(sum(c.adjustments), 0) from (select * from commission_live('2026-08-01') union all select * from commission_live('2026-09-01')) c where c.staff_id = s.id)
    - (select coalesce(sum(a.amount), 0) from payroll_adjustments a where a.staff_id = s.id
         and not exists (select 1 from expenses e where e.adjustment_id = a.id and e.category = 'kasbon' and e.voided_at is null and not s.pay_monthly)
         and (a.reason not like 'Kasbon%' and a.reason not like 'Batal kasbon%'))) as monthly_kasbon,
  (select coalesce(sum(amount), 0) from expenses e where e.staff_id = s.id and e.category = 'kasbon' and e.voided_at is null) as exp
from staff s where s.id::text like '00000000-0000-0000-00dd-%';
select results_eq($$ select id::text, (pays + monthly_kasbon + case when pay_monthly then 0 else greatest(0, exp - pays) end)::bigint = exp::bigint from inv order by id $$,
  $$ values ('00000000-0000-0000-00dd-000000000001', true), ('00000000-0000-0000-00dd-000000000002', true),
            ('00000000-0000-0000-00dd-000000000003', true), ('00000000-0000-0000-00dd-000000000004', true) $$,
  'AC4: invarian total potong kasbon = Σ expenses non-void (A,B,C,D)');
select is((select monthly_kasbon from inv where id = '00000000-0000-0000-00dd-000000000001')::bigint, 0::bigint, 'AC4: potong bulanan efektif A = 0 (tak dobel)');
select is((select monthly_kasbon from inv where id = '00000000-0000-0000-00dd-000000000003')::bigint, 70000::bigint, 'AC4: potong bulanan efektif C pay_monthly = 70rb');

-- AC5 (void setelah dipotong mingguan): D kasbon 40rb sudah terpotong 40rb; void → adjustments net 0, total_pay D = komisi, utang 0
select tests.login(tests.mgr());
select void_expense(:'ed'::uuid, 'uji batal setelah dipotong');
select tests.su();
select results_eq($$ select adjustments, total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00dd-000000000004' $$,
  $$ values (0::bigint, 50000::bigint) $$, 'AC5: void setelah dipotong → total_pay D = komisi 50rb, tak negatif');
select is((select coalesce(sum(amount), 0) from expenses where staff_id = '00000000-0000-0000-00dd-000000000004' and category = 'kasbon' and voided_at is null)::bigint,
  0::bigint, 'AC5: utang D = 0 → tak ada potongan lagi di minggu berikut');

-- AC6: potongan manual non-kasbon tetap masuk total_pay (juga untuk non-bulanan)
select tests.login(tests.mgr());
select payroll_add_adjustment('00000000-0000-0000-00dd-000000000002', '2026-08-01', 'deduction', 10000, 'denda uji');
select tests.su();
select results_eq($$ select adjustments, total_pay from commission_live('2026-08-01') where staff_id = '00000000-0000-0000-00dd-000000000002' $$,
  $$ values (-10000::bigint, 1040000::bigint) $$, 'AC6: potongan non-kasbon tetap mengurangi total_pay B');

-- AC11: rekonsiliasi (sisi bulanan): non-bulanan tak punya potongan kasbon efektif di bulan terbuka/mana pun (adj kasbon − wk tak ada kandidat dobel)
select is((select count(*) from commission_live('2026-08-01') c join staff s on s.id = c.staff_id
           where not s.pay_monthly and s.id::text like '00000000-0000-0000-00dd-%'
             and c.adjustments <> (select coalesce(sum(a.amount), 0) from payroll_adjustments a where a.staff_id = c.staff_id and a.month = '2026-08-01'
                                    and (a.reason not like 'Kasbon%' or exists (select 1 from expenses e where e.adjustment_id = a.id and e.voided_at is not null)
                                         or a.reason like 'Batal kasbon%'))
          )::int, 0, 'AC11: tak ada kandidat dobel (adj kasbon efektif non-bulanan = 0)');

-- AC8: payroll_close membekukan angka commission_live (tak berubah perilaku)
select tests.login(tests.mgr());
select payroll_close('2026-08-01');
select tests.su();
select results_eq($$ select adjustments, total_pay from payroll_snapshots where staff_name = 'Uji Dobel A' $$, $$ values (25000::bigint, 75000::bigint) $$,
  'AC8: snapshot A = commission_live (adj 25rb, total 75rb)');
select results_eq($$ select adjustments, total_pay from payroll_snapshots where staff_name = 'Uji Dobel C' $$, $$ values (-70000::bigint, 980000::bigint) $$,
  'AC8: snapshot C pay_monthly tetap memuat kasbon');

-- Review PR #17 M1: owner_report_extra.payroll_paid selaras dengan sisa dibayar (restPay): B non-bulanan total 1.040.000 − kasbon terpotong mingguan 50rb = 990rb; C pay_monthly 980rb utuh
select tests.login(tests.mgr());
select owner_report_extra(jkt_today(), jkt_today()) ->> 'payroll_paid' as pp0 \gset
select payroll_mark_paid('2026-08-01', '00000000-0000-0000-00dd-000000000002', 'transfer');
select is((owner_report_extra(jkt_today(), jkt_today()) ->> 'payroll_paid')::bigint - :pp0::bigint, 990000::bigint, 'M1: payroll_paid B = 990rb (kasbon terpotong mingguan ikut dikurangi)');
select payroll_mark_paid('2026-08-01', '00000000-0000-0000-00dd-000000000003', 'tunai');
select is((owner_report_extra(jkt_today(), jkt_today()) ->> 'payroll_paid')::bigint - :pp0::bigint, 990000::bigint + 980000, 'M1: payroll_paid C pay_monthly = 980rb (tak dikurangi dua kali)');

select * from finish();
rollback;
