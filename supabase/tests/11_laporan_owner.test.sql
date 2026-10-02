begin;
\ir helpers.psql
select plan(14);
create function tests.rep(a date, b date) returns jsonb language sql as $$ select owner_report(a, b, a - 30, a - 1, a - 365, b - 365) $$;
grant execute on function tests.rep(date, date) to authenticated;

-- Data hari ini: top-up Rina + transaksi bundle (deposit) + transaksi tunai + satu void.
select tests.login(tests.mgr());
select topup_deposit((select customer_id from profiles where id = tests.rina()), 'cash', (select id from deposit_packages where name = 'Classic'));
select checkout(jsonb_build_object('customer_id', (select customer_id from profiles where id = tests.rina()),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()),
                             jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari())),
  'method', 'cash', 'use_deposit', true));
select checkout(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Hair Spa'), 'staff_id', tests.staff_andi())), 'method', 'qris'));
select void_transaction(checkout(jsonb_build_object('items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Cukur Jenggot'), 'staff_id', tests.staff_andi())), 'method', 'cash')), 'salah input');

select tests.login(tests.mgr());
create temp table rep as select tests.rep(jkt_today(), jkt_today()) as r;
select tests.su(); -- pembanding memakai fungsi internal (tidak untuk authenticated)

select is((select (r -> 'finance' ->> 'net')::bigint from rep), (select (kpi_period(jkt_today(), jkt_today()) ->> 'omzet')::bigint),
          'omzet bersih = omzet Analitik (satu definisi)');
select is((select (r -> 'finance' ->> 'gross')::bigint - (r -> 'finance' ->> 'discount')::bigint from rep), (select (r -> 'finance' ->> 'net')::bigint from rep),
          'omzet kotor − diskon = omzet bersih');
select ok((select (r -> 'finance' ->> 'discount')::bigint from rep) > 0, 'diskon bundle tercatat');
select is((select (r -> 'finance' -> 'payments' ->> 'cash')::bigint + (r -> 'finance' -> 'payments' ->> 'qris')::bigint + (r -> 'finance' -> 'payments' ->> 'deposit')::bigint from rep),
          (select coalesce(sum(total), 0)::bigint from transactions where voided_at is null and created_at >= jkt(jkt_today(), '00:00')),
          'tunai + QRIS + deposit = total transaksi tidak di-void');
select is((select (r -> 'finance' ->> 'void_count')::int from rep), 1, 'void terhitung terpisah');
select is((select sum((c ->> 'net')::bigint)::bigint from rep, jsonb_array_elements(r -> 'finance' -> 'by_category') c), (select (r -> 'finance' ->> 'net')::bigint from rep),
          'jumlah per kategori = omzet bersih');
select is((select sum((x ->> 'net')::bigint)::bigint from rep, jsonb_array_elements(r -> 'daily') x), (select (r -> 'finance' ->> 'net')::bigint from rep),
          'jumlah harian = omzet bersih');
select is((select (r -> 'finance' -> 'deposit' ->> 'balance_end')::bigint from rep), (select sum(deposit_balance_of(id))::bigint from customers),
          'saldo deposit akhir = Σ saldo pelanggan');
select is((select (x ->> 'revenue')::bigint from rep, jsonb_array_elements(r -> 'staff') x where x ->> 'name' = 'Andi'),
          (select sum(ti.net_amount)::bigint from transaction_items ti join transactions t on t.id = ti.transaction_id
           where t.voided_at is null and ti.staff_id = tests.staff_andi() and t.created_at >= jkt(jkt_today(), '00:00')), 'omzet per staf');
select is((select (r -> 'summary' ->> 'margin')::bigint from rep),
          (select (r -> 'finance' ->> 'net')::bigint - (r -> 'finance' ->> 'hpp')::bigint from rep), 'margin kotor = omzet bersih − HPP');

select tests.login(tests.mgr());
select is((tests.rep(date_trunc('month', jkt_today())::date, (date_trunc('month', jkt_today()) + interval '1 month - 1 day')::date) -> 'payroll' ->> 'complete')::boolean,
          true, 'bulan penuh → gaji ikut dibandingkan');
select is((tests.rep(jkt_today(), jkt_today()) -> 'payroll' ->> 'complete')::boolean, false, 'rentang sebagian bulan → gaji tidak dihitung');

select tests.su();
update settings set revenue_target_monthly = 30000000;
select is(owner_revenue_target('2026-09-01', '2026-09-15'), 15000000::bigint, 'target 15 dari 30 hari = setengah target bulanan');

select tests.login(tests.kasir());
select throws_like($$ select tests.rep(jkt_today(), jkt_today()) $$, '%Akses ditolak%', 'kasir tidak bisa membuka laporan owner');

select * from finish();
rollback;
