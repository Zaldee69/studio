-- Audit tumpang tindih TT-12 (1 Nov): biaya staf laporan owner diambil dari mesin gaji bulanan, padahal staf mingguan
-- (Obay, Abdu, Ridwan) dibayar dari tutup komisi mingguan. Sekarang: staf mingguan = bayaran mingguan yang ditutup untuk bulan
-- itu (commission_week_pays, sudah dipotong kasbon/koreksi); staf bayar bulanan (pay_monthly) = gaji bulanan.
-- Bulan dianggap "ditutup" bila semua minggu yang menyentuh bulan itu sudah ditutup (gaji bulanan dihitung langsung, live).
create or replace function owner_payroll(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (
    select g::date as month from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') g
    where g::date >= p_from and (g + interval '1 month - 1 day')::date <= p_to
  ), wk_open as (
    select m.month, exists (select 1 from generate_series(date_trunc('week', m.month), m.month + interval '1 month - 1 day', interval '1 week') w
                            where not exists (select 1 from commission_weeks cw where cw.week_start = w::date and cw.status = 'closed')) as open
    from m
  ), c as (
    select m.month, x.staff_id, x.closed, x.total_pay, x.commission_service, x.commission_retail, x.subsidy, x.adjustments
    from m cross join lateral commission_for_period(m.month) x join staff s on s.id = x.staff_id and s.pay_monthly
    union all
    select p.month, p.staff_id, not o.open, sum(p.amount), sum(p.commission_service), sum(p.commission_retail), sum(p.subsidy),
           sum(p.amount - p.commission_service - p.commission_retail - p.subsidy)  -- potongan kasbon & koreksi (negatif)
    from commission_week_pays p join m on m.month = p.month join wk_open o on o.month = p.month
    join staff s on s.id = p.staff_id and not s.pay_monthly
    group by p.month, p.staff_id, o.open
  )
  select jsonb_build_object(
    'months', coalesce((select jsonb_agg(jsonb_build_object('month', m.month, 'closed', not o.open, 'total_pay', coalesce(x.total_pay, 0)) order by m.month)
                        from m join wk_open o using (month)
                        left join (select month, sum(total_pay)::bigint as total_pay from c group by month) x using (month)), '[]'),
    -- true bila periode tepat bulan-bulan penuh (bulan/kuartal/tahun): gaji bisa dibandingkan langsung dengan omzet
    'complete', date_trunc('month', p_from)::date = p_from and (date_trunc('month', p_to) + interval '1 month - 1 day')::date = p_to,
    'all_closed', not exists (select 1 from wk_open where open),
    'total_pay', (select coalesce(sum(total_pay), 0) from c),
    'commission_service', (select coalesce(sum(commission_service), 0) from c),
    'commission_retail', (select coalesce(sum(commission_retail), 0) from c),
    'subsidy', (select coalesce(sum(subsidy), 0) from c),
    'adjustments', (select coalesce(sum(adjustments), 0) from c),
    'by_staff', coalesce((select jsonb_object_agg(staff_id::text, total_pay) from (select staff_id, sum(total_pay)::bigint as total_pay from c group by staff_id) s), '{}'))
$$;
