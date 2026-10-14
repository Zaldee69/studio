begin;
\ir helpers.psql
select plan(5);

-- Pengeluaran rutin: templat IPL tgl 1 → pengingat sampai dicatat; dicatat lewat add_expense(p_template_id) → tidak diingatkan lagi.
select tests.su();
delete from notifications where kind = 'expense_due';
insert into expense_templates (category, description, amount, source, day_of_month) values ('ipl', 'IPL Ruko', 250000, 'transfer', 1) returning id as tpl \gset

select is(recurring_expense_reminders(), 1, 'jatuh tempo & belum dicatat → manajer diingatkan');
select is(recurring_expense_reminders(), 0, 'sekali per hari');

select tests.login(tests.kasir());
select throws_like($$ select add_expense(jkt_today(), 'ipl', 'IPL Ruko', 50000, 'laci', null, null, '$$ || :'tpl' || $$') $$, '%dicatat manajer%', 'kasir tidak mencatat pengeluaran rutin');
select tests.login(tests.mgr());
select add_expense(jkt_today(), 'ipl', 'IPL Ruko', 250000, 'transfer', 'expenses/uji.jpg', null, :'tpl');
select is((select count(*) from expenses where template_id = :'tpl' and voided_at is null), 1::bigint, 'tercatat dengan tautan templat');

select tests.su();
delete from notifications where kind = 'expense_due';
select is(recurring_expense_reminders(), 0, 'sudah dicatat bulan ini → tidak diingatkan');

select * from finish();
rollback;
