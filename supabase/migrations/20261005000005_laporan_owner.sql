-- Laporan owner (Analitik → Laporan owner): keuangan, staf & layanan, pelanggan & deposit, operasional & kepatuhan,
-- per periode + perbandingan (periode sebelumnya & tahun lalu, ditentukan aplikasi) + capaian target.
-- Satu definisi angka: omzet bersih = Σ net_amount item transaksi tidak di-void, tanggal Asia/Jakarta — sama dengan
-- kpi_period()/daily_sales(). Fungsi di bawah hanya menambah rincian yang tidak ada di ringkasan KPI (HPP, diskon,
-- void, metode bayar, deposit, gaji, stok). Semua khusus manajer (dipanggil lewat owner_report).

alter table settings add column revenue_target_monthly bigint not null default 0 check (revenue_target_monthly >= 0);

-- ---------- Keuangan ----------
create function owner_finance(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select jkt(p_from, '00:00') as a0, jkt(p_to + 1, '00:00') as a1),
  tx as (select t.* from transactions t, b where t.created_at >= b.a0 and t.created_at < b.a1),
  it as (select ti.category::text as cat, ti.price, ti.discount_share, ti.net_amount, coalesce(c.hpp, 0) as hpp
         from tx t join transaction_items ti on ti.transaction_id = t.id
         left join transaction_item_costs c on c.transaction_item_id = ti.id
         where t.voided_at is null),
  cat as (select cat, sum(price) as gross, sum(discount_share) as disc, sum(net_amount) as net, sum(hpp) as hpp, count(*) as items
          from it group by cat),
  top as (select d.* from deposit_topups d, b where d.created_at >= b.a0 and d.created_at < b.a1)
  select jsonb_build_object(
    'tx_count', (select count(*) from tx where voided_at is null),
    'void_count', (select count(*) from tx where voided_at is not null),
    'void_amount', (select coalesce(sum(total), 0) from tx where voided_at is not null),
    'gross', (select coalesce(sum(price), 0) from it),
    'discount', (select coalesce(sum(discount_share), 0) from it),
    'net', (select coalesce(sum(net_amount), 0) from it),
    'hpp', (select coalesce(sum(hpp), 0) from it),
    'by_category', (select jsonb_agg(jsonb_build_object('category', c, 'items', coalesce(items, 0), 'gross', coalesce(gross, 0),
                                                        'discount', coalesce(disc, 0), 'net', coalesce(net, 0), 'hpp', coalesce(hpp, 0),
                                                        'margin', coalesce(net, 0) - coalesce(hpp, 0))
                                     order by array_position(array['barbershop', 'nail', 'retail'], c))
                    from unnest(array['barbershop', 'nail', 'retail']) c left join cat on cat.cat = c),
    'payments', jsonb_build_object(
      'cash', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('cash', 'deposit_cash')),
      'qris', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('qris', 'deposit_qris')),
      'deposit', (select coalesce(sum(deposit_used), 0) from tx where voided_at is null)),
    'deposit', jsonb_build_object(
      'topup_count', (select count(*) from top),
      'topup_paid', (select coalesce(sum(amount_paid), 0) from top),
      'topup_cash', (select coalesce(sum(amount_paid), 0) from top where method = 'cash'),
      'topup_qris', (select coalesce(sum(amount_paid), 0) from top where method = 'qris'),
      'topup_credited', (select coalesce(sum(amount_credited), 0) from top),
      'bonus', (select coalesce(sum(amount_credited - amount_paid), 0) from top),
      'used', (select coalesce(sum(deposit_used), 0) from tx where voided_at is null),
      -- saldo semua pelanggan per akhir periode (kewajiban toko) = Σ deposit_balance_of() bila periode sampai hari ini
      'balance_end', (select coalesce(sum(amount_credited), 0) from deposit_topups, b where created_at < b.a1)
                   - (select coalesce(sum(deposit_used), 0) from transactions, b where voided_at is null and created_at < b.a1)),
    'maintenance_cost', (select coalesce(sum(m.cost), 0) from maintenance_logs m, b where m.created_at >= b.a0 and m.created_at < b.a1))
$$;

-- Gaji & komisi: per bulan kalender yang SELURUHNYA ada di periode (komisi dihitung bulanan). Bulan tertutup =
-- snapshot, terbuka = hitungan berjalan (commission_for_period).
create function owner_payroll(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select g::date as month from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g
    where g::date >= p_from and (g + interval '1 month - 1 day')::date <= p_to
  ), c as (select m.month, x.* from m cross join lateral commission_for_period(m.month) x)
  select jsonb_build_object(
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', month, 'closed', closed, 'total_pay', total_pay) order by month)
                        from (select month, bool_and(closed) as closed, sum(total_pay)::bigint as total_pay from c group by month) x), '[]'),
    -- true bila periode tepat bulan-bulan penuh (bulan/kuartal/tahun): gaji bisa dibandingkan langsung dengan omzet
    'complete', date_trunc('month', p_from)::date = p_from and (date_trunc('month', p_to) + interval '1 month - 1 day')::date = p_to,
    'all_closed', coalesce((select bool_and(closed) from c), false),
    'total_pay', (select coalesce(sum(total_pay), 0) from c),
    'commission_service', (select coalesce(sum(commission_service), 0) from c),
    'commission_retail', (select coalesce(sum(commission_retail), 0) from c),
    'subsidy', (select coalesce(sum(subsidy), 0) from c),
    'adjustments', (select coalesce(sum(adjustments), 0) from c),
    'by_staff', coalesce((select jsonb_object_agg(staff_id::text, total_pay) from (select staff_id, sum(total_pay)::bigint as total_pay from c group by staff_id) s), '{}'))
$$;

-- ---------- Staf & layanan ----------
create function owner_staff(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select jkt(p_from, '00:00') as a0, jkt(p_to + 1, '00:00') as a1, open_minutes(p_from, p_to) as avail),
  s as (select staff_id, category, sum(tx_count)::int as tx, sum(revenue_net)::bigint as rev, sum(upsell_tx)::int as up, sum(item_count)::int as items
        from daily_sales(p_from, p_to) where by_staff group by staff_id, category),
  h as (select ti.staff_id, sum(coalesce(c.hpp, 0))::bigint as hpp
        from transactions t join transaction_items ti on ti.transaction_id = t.id
        left join transaction_item_costs c on c.transaction_item_id = ti.id, b
        where t.voided_at is null and t.created_at >= b.a0 and t.created_at < b.a1 group by ti.staff_id),
  u as (select staff_id, sum(sold_minutes) as sold from daily_resource_minutes(p_from, p_to) group by staff_id),
  ns as (select a.staff_id, count(*) filter (where a.status = 'no_show')::int as no_show,
                count(*) filter (where a.status in ('completed', 'paid'))::int as served
         from appointments a, b where a.start_at >= b.a0 and a.start_at < b.a1 group by a.staff_id)
  select coalesce(jsonb_agg(jsonb_build_object(
    'staff_id', st.id, 'name', st.name, 'category', st.category, 'active', st.active,
    'tx', coalesce(al.tx, 0), 'revenue', coalesce(al.rev, 0),
    'service_revenue', coalesce(sv.rev, 0), 'service_items', coalesce(sv.items, 0), 'retail_revenue', coalesce(rt.rev, 0),
    'aov', case when coalesce(al.tx, 0) > 0 then round(al.rev::numeric / al.tx) end,
    'upsell_rate', case when coalesce(al.tx, 0) > 0 then al.up * 100.0 / al.tx end,
    'hpp', coalesce(h.hpp, 0),
    'utilization', case when b.avail > 0 then coalesce(u.sold, 0) * 100 / b.avail end,
    'served', coalesce(ns.served, 0), 'no_show', coalesce(ns.no_show, 0))
    order by st.category, st.sort, st.name), '[]')
  from staff st cross join b
  left join s al on al.staff_id = st.id and al.category = 'all'
  left join s sv on sv.staff_id = st.id and sv.category = 'service'
  left join s rt on rt.staff_id = st.id and rt.category = 'retail'
  left join h on h.staff_id = st.id
  left join u on u.staff_id = st.id
  left join ns on ns.staff_id = st.id
  where st.active or coalesce(al.tx, 0) > 0
$$;

create function owner_services(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select jkt(p_from, '00:00') as a0, jkt(p_to + 1, '00:00') as a1),
  x as (select ti.name, ti.category::text as category, count(*)::int as qty, sum(ti.net_amount)::bigint as revenue,
               sum(coalesce(c.hpp, 0))::bigint as hpp
        from transactions t join transaction_items ti on ti.transaction_id = t.id
        left join transaction_item_costs c on c.transaction_item_id = ti.id, b
        where t.voided_at is null and t.created_at >= b.a0 and t.created_at < b.a1
        group by ti.name, ti.category)
  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'category', category, 'qty', qty, 'revenue', revenue, 'hpp', hpp,
                                               'margin', revenue - hpp, 'margin_pct', case when revenue > 0 then (revenue - hpp) * 100.0 / revenue end)
                            order by revenue desc, name), '[]')
  from x
$$;

-- ---------- Pelanggan teratas & operasional ----------
create function owner_top_customers(p_from date, p_to date, p_limit int default 10) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('name', c.name, 'visits', x.visits, 'spend', x.spend, 'deposit_balance', deposit_balance_of(c.id))
                            order by x.spend desc, c.name), '[]')
  from (select t.customer_id, count(*)::int as visits, sum(t.total)::bigint as spend
        from transactions t
        where t.voided_at is null and t.customer_id is not null
          and t.created_at >= jkt(p_from, '00:00') and t.created_at < jkt(p_to + 1, '00:00')
        group by t.customer_id order by spend desc limit p_limit) x
  join customers c on c.id = x.customer_id
$$;

create function owner_inventory(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a0 timestamptz := jkt(p_from, '00:00'); a1 timestamptz := jkt(p_to + 1, '00:00'); o1 uuid; o2 uuid; n int; r jsonb;
        flagged int := 0; var_value bigint := 0;
begin
  -- selisih pemakaian bahan: opname disetujui pertama & terakhir yang dimulai di periode (butuh ≥ 2)
  select count(*), (array_agg(id order by started_at))[1], (array_agg(id order by started_at desc))[1] into n, o1, o2
  from stock_opnames where status = 'approved' and started_at >= a0 and started_at < a1;
  if n >= 2 then
    select count(*) filter (where u.flagged), coalesce(sum(u.variance_value), 0) into flagged, var_value from usage_report(o1, o2) u;
  end if;
  -- nilai = qty × harga pokok (rata-rata) saat ini — harga pokok historis per tanggal tidak disimpan
  with mv as (
    select i.kind, i.unit_cost, i.reorder_at, i.active,
           coalesce(sum(m.qty) filter (where m.created_at < a1), 0) as stock_end,
           coalesce(sum(m.qty), 0) as stock_now,
           coalesce(sum(m.qty) filter (where m.type = 'in' and m.created_at >= a0 and m.created_at < a1), 0) as qty_in,
           coalesce(-sum(m.qty) filter (where m.type in ('use', 'sale') and m.created_at >= a0 and m.created_at < a1), 0) as qty_out,
           coalesce(sum(m.qty) filter (where m.type in ('opname', 'adjust') and m.created_at >= a0 and m.created_at < a1), 0) as qty_adjust
    from inventory_items i left join stock_moves m on m.item_id = i.id group by i.id)
  select jsonb_build_object(
    'value_end', coalesce(round(sum(greatest(stock_end, 0) * unit_cost) filter (where active)), 0),
    'value_consumable', coalesce(round(sum(greatest(stock_end, 0) * unit_cost) filter (where active and kind = 'consumable')), 0),
    'value_retail', coalesce(round(sum(greatest(stock_end, 0) * unit_cost) filter (where active and kind = 'retail')), 0),
    'in_value', coalesce(round(sum(qty_in * unit_cost)), 0),
    'out_value', coalesce(round(sum(qty_out * unit_cost)), 0),
    'adjust_value', coalesce(round(sum(qty_adjust * unit_cost)), 0),
    'low_stock_now', count(*) filter (where active and reorder_at > 0 and stock_now <= reorder_at),
    'opnames', n, 'usage_flagged', flagged, 'usage_variance_value', var_value) into r
  from mv;
  return r;
end $$;

create function owner_operations(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with b as (select jkt(p_from, '00:00') as a0, jkt(p_to + 1, '00:00') as a1)
  select jsonb_build_object(
    'utilization', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'type', type, 'pct', pct, 'sold_minutes', sold_minutes,
                                                                 'available_minutes', available_minutes) order by type, name)
                             from kpi_utilization(p_from, p_to)), '[]'),
    'peak_hours', coalesce((select jsonb_agg(jsonb_build_object('weekday', weekday, 'hour', hour, 'minutes_avg', round(minutes_avg))
                                             order by minutes_avg desc)
                            from (select * from kpi_heatmap(p_from, p_to) where not closed and minutes_avg > 0
                                  order by minutes_avg desc limit 5) h), '[]'),
    'sop', (select jsonb_build_object('operational', r -> 'operational', 'ok', r -> 'ok', 'compliance_pct', r -> 'compliance_pct')
            from (select sop_compliance_report(p_from, p_to) as r) x),
    'maintenance_done', (select count(*) from maintenance_logs m, b where m.created_at >= b.a0 and m.created_at < b.a1),
    'maintenance_overdue_now', (select count(*) from maintenance_status_internal(jkt_today()) where days_left < 0),
    'inventory', owner_inventory(p_from, p_to))
$$;

-- ---------- Harian (sheet Excel) ----------
create function owner_daily(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select g::date as day from generate_series(p_from, p_to, interval '1 day') g),
  tx as (select (t.created_at at time zone 'Asia/Jakarta')::date as day, t.*
         from transactions t where t.created_at >= jkt(p_from, '00:00') and t.created_at < jkt(p_to + 1, '00:00')),
  it as (select tx.day, ti.category::text as cat, ti.discount_share, ti.net_amount, coalesce(c.hpp, 0) as hpp
         from tx join transaction_items ti on ti.transaction_id = tx.id
         left join transaction_item_costs c on c.transaction_item_id = ti.id where tx.voided_at is null)
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day,
    'tx', (select count(*) from tx where tx.day = d.day and voided_at is null),
    'net', (select coalesce(sum(net_amount), 0) from it where it.day = d.day),
    'barbershop', (select coalesce(sum(net_amount), 0) from it where it.day = d.day and cat = 'barbershop'),
    'nail', (select coalesce(sum(net_amount), 0) from it where it.day = d.day and cat = 'nail'),
    'retail', (select coalesce(sum(net_amount), 0) from it where it.day = d.day and cat = 'retail'),
    'discount', (select coalesce(sum(discount_share), 0) from it where it.day = d.day),
    'hpp', (select coalesce(sum(hpp), 0) from it where it.day = d.day),
    'void', (select count(*) from tx where tx.day = d.day and voided_at is not null),
    'cash', (select coalesce(sum(paid_amount), 0) from tx where tx.day = d.day and voided_at is null and payment_method in ('cash', 'deposit_cash')),
    'qris', (select coalesce(sum(paid_amount), 0) from tx where tx.day = d.day and voided_at is null and payment_method in ('qris', 'deposit_qris')),
    'deposit', (select coalesce(sum(deposit_used), 0) from tx where tx.day = d.day and voided_at is null)) order by d.day), '[]')
  from d
$$;

-- ---------- Ringkasan untuk perbandingan (periode sebelumnya / tahun lalu) ----------
create function owner_summary(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare f jsonb := owner_finance(p_from, p_to); k jsonb := kpi_period(p_from, p_to); cu jsonb := kpi_customers(p_from, p_to);
        o jsonb := kpi_online(p_from, p_to); s jsonb := sop_compliance_report(p_from, p_to);
        net bigint := (f ->> 'net')::bigint; hpp bigint := (f ->> 'hpp')::bigint;
begin
  return jsonb_build_object(
    'from', p_from, 'to', p_to,
    'net', net, 'gross', f -> 'gross', 'discount', f -> 'discount', 'hpp', hpp, 'margin', net - hpp,
    'margin_pct', case when net > 0 then (net - hpp) * 100.0 / net end,
    'tx_count', k -> 'tx_count', 'aov', k -> 'aov_all', 'aov_barbershop', k -> 'aov_barbershop', 'aov_nail', k -> 'aov_nail',
    'rev_barbershop', k -> 'rev_barbershop', 'rev_nail', k -> 'rev_nail', 'rev_retail', k -> 'rev_retail',
    'retail_ratio', k -> 'retail_ratio', 'utilization', k -> 'utilization_avg',
    'void_count', f -> 'void_count', 'topup_paid', f -> 'deposit' -> 'topup_paid',
    'new_customers', cu -> 'new_customers', 'returning', cu -> 'returning', 'return_rate', cu -> 'return_rate',
    'no_show_rate', o -> 'no_show_rate', 'online_share', o -> 'share_online',
    'sop_compliance', s -> 'compliance_pct');
end $$;

-- Target omzet periode = target bulanan × porsi hari tiap bulan yang tercakup.
create function owner_revenue_target(p_from date, p_to date) returns bigint
language sql stable security definer set search_path = public as $$
  select round(coalesce(sum(
           (least(p_to, (g + interval '1 month - 1 day')::date) - greatest(p_from, g::date) + 1)::numeric
           / extract(day from g + interval '1 month - 1 day')), 0) * (select revenue_target_monthly from settings))::bigint
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g
$$;

create function owner_report(p_from date, p_to date, p_prev_from date, p_prev_to date, p_ly_from date, p_ly_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st settings;
begin
  perform require_role('manager');
  if p_to < p_from or p_to - p_from > 400 then raise exception 'Periode tidak valid (maks. ±13 bulan)'; end if;
  select * into st from settings;
  return jsonb_build_object(
    'summary', owner_summary(p_from, p_to),
    'previous', owner_summary(p_prev_from, p_prev_to),
    'last_year', owner_summary(p_ly_from, p_ly_to),
    'finance', owner_finance(p_from, p_to),
    'payroll', owner_payroll(p_from, p_to),
    'staff', owner_staff(p_from, p_to),
    'services', owner_services(p_from, p_to),
    'customers', kpi_customers(p_from, p_to) || jsonb_build_object('top', owner_top_customers(p_from, p_to)),
    'online', kpi_online(p_from, p_to),
    'operations', owner_operations(p_from, p_to),
    'daily', owner_daily(p_from, p_to),
    'insights', coalesce((select jsonb_agg(to_jsonb(i) order by i.priority) from kpi_insights(p_from, p_to) i), '[]'),
    'targets', jsonb_build_object('revenue', owner_revenue_target(p_from, p_to), 'revenue_monthly', st.revenue_target_monthly,
      'aov_barbershop', st.aov_target_barbershop, 'aov_nail', st.aov_target_nail, 'utilization', st.utilization_target,
      'retail_min', st.retail_ratio_min, 'retail_max', st.retail_ratio_max));
end $$;

revoke execute on function owner_finance(date, date), owner_payroll(date, date), owner_staff(date, date), owner_services(date, date),
  owner_top_customers(date, date, int), owner_inventory(date, date), owner_operations(date, date), owner_daily(date, date),
  owner_summary(date, date), owner_revenue_target(date, date) from public, anon, authenticated;
revoke execute on function owner_report(date, date, date, date, date, date) from public, anon;
grant execute on function owner_report(date, date, date, date, date, date) to authenticated;
