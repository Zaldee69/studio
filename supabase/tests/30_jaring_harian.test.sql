begin;
\ir helpers.psql
select plan(9);

-- Jaring harian: C berjaring Rp75.000/hari (komisi 50%), D tanpa jaring harian (tetap jaring bulanan). Minggu 3–9 Agu 2026.
select tests.su();
insert into staff (id, name, category, commission_pct_override, daily_min_pay) values
  ('00000000-0000-0000-00bb-000000000001', 'Uji Harian C', 'barbershop', 50, 75000),
  ('00000000-0000-0000-00bb-000000000002', 'Uji Harian D', 'barbershop', 50, null);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at, voided_at, void_reason) values
  ('00000000-0000-0000-00bb-0000000000a1', 100000, 100000, 100000, 'cash', jkt('2026-08-03', '10:00'), null, null), -- komisi 50rb → subsidi 25rb
  ('00000000-0000-0000-00bb-0000000000a2', 200000, 200000, 200000, 'cash', jkt('2026-08-04', '10:00'), null, null), -- komisi 100rb → 0
  ('00000000-0000-0000-00bb-0000000000a3', 50000, 50000, 50000, 'cash', jkt('2026-08-05', '10:00'), now(), 'uji'),   -- void → bukan hari kerja
  ('00000000-0000-0000-00bb-0000000000a4', 100000, 100000, 100000, 'cash', jkt('2026-08-03', '11:00'), null, null);
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00bb-0000000000a1', '00000000-0000-0000-00bb-000000000001', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00bb-0000000000a2', '00000000-0000-0000-00bb-000000000001', 'Potong', 'barbershop', 200000, 200000),
  ('00000000-0000-0000-00bb-0000000000a3', '00000000-0000-0000-00bb-000000000001', 'Potong', 'barbershop', 50000, 50000),
  ('00000000-0000-0000-00bb-0000000000a4', '00000000-0000-0000-00bb-000000000002', 'Potong', 'barbershop', 100000, 100000);

select tests.login(tests.mgr());
create temp view c as select * from commission_week('2026-08-05') where staff_id = '00000000-0000-0000-00bb-000000000001';
select results_eq($$ select subsidy, amount from c $$, $$ values (25000::bigint, 175000::bigint) $$,
  'live: subsidi hanya hari komisi < jaring (Senin), hari void bukan hari kerja; ikut total mingguan');
select is((select subsidy from commission_week('2026-08-03') where staff_id = '00000000-0000-0000-00bb-000000000002'), 0::bigint,
  'staf tanpa jaring harian: tanpa subsidi mingguan');

select ok(commission_week_close('2026-08-03') > 0, 'minggu ditutup');
select results_eq($$ select subsidy, amount from commission_week_pays where staff_id = '00000000-0000-0000-00bb-000000000001' $$,
  $$ values (25000::bigint, 175000::bigint) $$, 'subsidi dibekukan bersama komisi mingguan');
select results_eq($$ select subsidy, amount from c $$, $$ values (25000::bigint, 175000::bigint) $$, 'minggu tertutup menampilkan angka beku');

select tests.su();
create temp view m as select * from commission_live('2026-08-01');
select is((select subsidy from m where staff_id = '00000000-0000-0000-00bb-000000000001'), 25000::bigint,
  'bulanan: subsidi = total subsidi harian (menggantikan jaring bulanan)');
select is((select total_pay - (select sum(amount) from commission_week_pays w where w.staff_id = m.staff_id and w.month = '2026-08-01')
           from m where staff_id = '00000000-0000-0000-00bb-000000000001')::bigint, 0::bigint, 'akhir bulan: sisa 0 — tidak dibayar dobel');
select is((select subsidy from m where staff_id = '00000000-0000-0000-00bb-000000000002'),
          greatest(0, (select min_monthly_pay from settings) - 50000)::bigint, 'staf tanpa jaring harian tetap pakai jaring bulanan');

select tests.su();
select throws_like($$ update staff set daily_min_pay = 0 where id = '00000000-0000-0000-00bb-000000000001' $$, '%check%', 'jaring harian harus > 0 (kosong = nonaktif)');

select * from finish();
rollback;
