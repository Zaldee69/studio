begin;
\ir helpers.psql
select plan(3);

-- Audit KPI-6 (1 Nov): pijat setara di analitik — penggerak AOV, target, insight.
select tests.su();
update settings set aov_target_massage = 500000, insight_aov_gap_pct = 10;
insert into staff (id, name, category) values ('00000000-0000-0000-00f6-0000000000a1', 'Terapis Uji', 'massage');
with t as (insert into transactions (subtotal, total, paid_amount, payment_method) values (100000, 100000, 100000, 'cash') returning id)
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount)
select id, '00000000-0000-0000-00f6-0000000000a1', 'Pijat Uji', 'massage', 100000, 100000 from t;

select tests.login(tests.mgr());
set local role postgres;
select ok(exists (select 1 from kpi_aov_drivers(jkt_today(), jkt_today()) where category = 'massage' and tx_count >= 1), 'penggerak AOV memuat pijat');
select is((kpi_summary(jkt_today(), jkt_today()) -> 'targets' ->> 'aov_massage')::bigint, 500000::bigint, 'target AOV pijat ikut di ringkasan');
select ok(exists (select 1 from kpi_insights(jkt_today(), jkt_today()) where code = 'aov_massage' and message like 'AOV Pijat%'), 'insight AOV pijat di bawah target');

select * from finish();
rollback;
