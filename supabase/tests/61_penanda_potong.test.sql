begin;
\ir helpers.psql
select plan(2);

-- Audit KPI-7 (1 Nov): "potong" & "naik paket" dari penanda layanan, bukan nama — ganti nama layanan tidak mengubah angka.
select tests.su();
update services set is_cut = true, is_upgrade = true where id = tests.svc('Potong Rambut');
with t as (insert into transactions (subtotal, total, paid_amount, payment_method) values (50000, 50000, 50000, 'cash') returning id)
insert into transaction_items (transaction_id, service_id, staff_id, name, category, price, net_amount)
select id, tests.svc('Potong Rambut'), tests.staff_andi(), 'Potong Rambut', 'barbershop', 50000, 50000 from t;

select tests.login(tests.mgr());
select (campaign_report(jkt_today(), jkt_today()) -> 'cuts' ->> 'total')::int as n0, (campaign_report(jkt_today(), jkt_today()) -> 'cuts' ->> 'upgrade')::int as u0 \gset
select tests.su();
update services set name = 'Cukur Klasik Uji' where id = tests.svc('Potong Rambut');
select tests.login(tests.mgr());
select is((campaign_report(jkt_today(), jkt_today()) -> 'cuts' ->> 'total')::int, :n0, 'ganti nama layanan: jumlah potong tetap');
select is((campaign_report(jkt_today(), jkt_today()) -> 'cuts' ->> 'upgrade')::int, :u0, 'ganti nama layanan: naik paket tetap');

select * from finish();
rollback;
