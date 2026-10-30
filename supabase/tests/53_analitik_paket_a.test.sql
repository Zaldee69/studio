begin;
\ir helpers.psql
select plan(9);

-- Analitik Paket A (rapat 31 Okt). Data lokal bisa sudah berisi transaksi hari ini → dibandingkan sebelum/sesudah.
-- Manajer (klaim JWT) + peran postgres: fungsi internal KPI tidak diberikan ke authenticated, tetapi tetap cek peran manajer.
select tests.login(tests.mgr());
set local role postgres;
select (kpi_period(jkt_today(), jkt_today()) ->> 'tx_massage')::int as m0,
       (kpi_customers(jkt_today(), jkt_today()) -> 'recorded' ->> 'tx')::int as t0,
       (kpi_customers(jkt_today(), jkt_today()) -> 'recorded' ->> 'with_customer')::int as w0,
       coalesce((select (x ->> 'n')::int from jsonb_array_elements(campaign_report(jkt_today(), jkt_today()) -> 'new_customers') x where x ->> 'source' = 'teman'), 0) as teman0,
       coalesce((select (x ->> 'n')::int from jsonb_array_elements(campaign_report(jkt_today(), jkt_today()) -> 'new_customers') x where x ->> 'source' = 'lainnya'), 0) as lain0,
       (owner_report_extra('2030-01-07', '2030-01-13') ->> 'base_salary_est')::bigint as gaji0 \gset

select tests.su();
insert into staff (id, name, category) values ('00000000-0000-0000-00f3-0000000000a1', 'Terapis Uji', 'massage');
insert into customers (id, name, whatsapp, source) values
  ('00000000-0000-0000-00f3-000000000001', 'Uji Teman', '6281299993001', 'teman'),
  ('00000000-0000-0000-00f3-000000000002', 'Kontak Impor', '6281299993002', 'lainnya');
with t as (
  insert into transactions (customer_id, subtotal, total, paid_amount, payment_method) values
    ('00000000-0000-0000-00f3-000000000001', 100000, 100000, 100000, 'cash'),
    (null, 50000, 50000, 50000, 'cash'), (null, 50000, 50000, 50000, 'cash')
  returning id, total)
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount)
select id, case when total = 100000 then '00000000-0000-0000-00f3-0000000000a1'::uuid else tests.staff_andi() end,
       case when total = 100000 then 'Pijat Uji' else 'Potong Uji' end,
       (case when total = 100000 then 'massage' else 'barbershop' end)::service_category, total, total from t;
update staff set base_salary = 3100000 where id = tests.staff_andi();

select tests.login(tests.mgr());
set local role postgres;
select is((kpi_period(jkt_today(), jkt_today()) ->> 'tx_massage')::int, :m0 + 1, 'pijat dihitung di KPI');
select ok(kpi_period(jkt_today(), jkt_today()) ->> 'aov_massage' is not null, 'AOV pijat tersedia');
select ok(exists (select 1 from kpi_aov_daily(jkt_today(), jkt_today()) where aov_massage is not null and tx_massage >= 1), 'AOV harian pijat');
select is((kpi_customers(jkt_today(), jkt_today()) -> 'recorded' ->> 'tx')::int, :t0 + 3, 'pencatatan: semua transaksi');
select is((kpi_customers(jkt_today(), jkt_today()) -> 'recorded' ->> 'with_customer')::int, :w0 + 1, 'pencatatan: transaksi dengan pelanggan');
select is(coalesce((select (x ->> 'n')::int from jsonb_array_elements(campaign_report(jkt_today(), jkt_today()) -> 'new_customers') x where x ->> 'source' = 'teman'), 0),
  :teman0 + 1, 'pelanggan baru per sumber = transaksi pertama');
select is(coalesce((select (x ->> 'n')::int from jsonb_array_elements(campaign_report(jkt_today(), jkt_today()) -> 'new_customers') x where x ->> 'source' = 'lainnya'), 0),
  :lain0, 'kontak tanpa transaksi bukan pelanggan baru');
select is((owner_report_extra('2030-01-07', '2030-01-13') ->> 'base_salary_est')::bigint, (:gaji0 + 700000)::bigint, 'gaji pokok prorata: 3,1 jt / 31 hari × 7');

select tests.su();
select alert_midweek();
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '📊 Cek tengah minggu%Transaksi dengan pelanggan minggu ini: %target 40%'),
  'cek tengah minggu menyebut % pencatatan');

select * from finish();
rollback;
