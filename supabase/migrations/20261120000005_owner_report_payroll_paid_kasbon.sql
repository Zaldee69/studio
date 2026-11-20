-- Laporan owner: payroll_paid ikut mengurangi kasbon yang sudah dipotong dari komisi mingguan (T-01900551, review PR #17 M1).
-- Sebelumnya: total_pay − Σ commission_week_pays.amount. Sejak 20261120000004 total_pay staf non-bulanan tak memuat adjustment kasbon,
-- padahal kasbon itu sudah dipotong dari komisi mingguan → payroll_paid kelebihan sebesar Σ commission_week_pays.kasbon bulan itu.
-- Rumus baru = sama dengan restPay (src/features/sdm/shared.ts): total_pay − Σ amount mingguan − (Σ kasbon terpotong mingguan bulan itu,
-- kecuali total_pay sudah memuat adjustment kasbon: pay_monthly / snapshot lama → deteksi sama: adj kasbon ≠ 0 dan snapshot.adjustments = Σ semua adjustment bulan itu).
-- Hanya owner_report_extra yang berubah; tanpa DDL/data. Grant dipertahankan oleh create or replace.
-- ponytail: deteksi lewat kesetaraan nilai (rapuh, sama dengan restPay); kolom eksplisit di payroll_snapshots bila perlu kokoh.
--
-- ROLLBACK: jalankan definisi lama di bawah (hasil 20261031000003 + 20261012000016) tanpa tanda komentar.

CREATE OR REPLACE FUNCTION public.owner_report_extra(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare a0 timestamptz := jkt(p_from, '00:00'); a1 timestamptz := jkt(p_to + 1, '00:00'); r jsonb;
begin
  perform require_role('manager');
  with ap as (select * from appointments where start_at >= a0 and start_at < a1),
  -- komisi estimasi: baris komisi bulan-bulan yang tersentuh periode, dipotong ke rentang tanggal (sebelum subsidi gaji minimum)
  months as (select distinct date_trunc('month', g)::date as m from generate_series(p_from, p_to, interval '1 day') g),
  cl as (select l.* from months, lateral commission_lines(months.m) l where l.created_at >= a0 and l.created_at < a1),
  cc as (select distinct on (date) date, difference from cash_closings where date between p_from and p_to order by date, created_at desc),
  txd as (select distinct (created_at at time zone 'Asia/Jakarta')::date as d from transactions where created_at >= a0 and created_at < a1 and voided_at is null)
  select jsonb_build_object(
    'bookings', (select count(*) filter (where status not in ('cancelled', 'pending_review')) from ap),
    'bookings_paid', (select count(*) filter (where status = 'paid') from ap),
    'bookings_cancelled', (select count(*) filter (where status = 'cancelled') from ap),
    'bookings_no_show', (select count(*) filter (where status = 'no_show') from ap),
    'bookings_walk_in', (select count(*) filter (where source = 'walk_in' and status <> 'cancelled') from ap),
    'commission_est', (select coalesce(sum(commission), 0) from cl),
    'hpp_items', (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id
                  where t.voided_at is null and ti.category <> 'retail' and t.created_at >= a0 and t.created_at < a1),
    'hpp_items_filled', (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id
                         join transaction_item_costs c on c.transaction_item_id = ti.id
                         where t.voided_at is null and ti.category <> 'retail' and c.hpp > 0 and t.created_at >= a0 and t.created_at < a1),
    'subsidy_est', (select coalesce(round(sum(w.subsidy * (least(wk + 6, p_to) - greatest(wk, p_from) + 1) / 7.0)), 0)::bigint
                    from generate_series(date_trunc('week', p_from)::date, p_to, interval '1 week') g(wk_ts),
                         lateral (select g.wk_ts::date as wk) x, lateral commission_week_rows(x.wk) w),
    'base_salary_est', (select coalesce(round(sum(s.base_salary::numeric / extract(day from date_trunc('month', d) + interval '1 month - 1 day'))), 0)::bigint
                        from generate_series(p_from, p_to, interval '1 day') d
                        join staff s on s.base_salary is not null and s.active and (s.created_at at time zone 'Asia/Jakarta')::date <= d::date),
    'commission_weekly_paid', (select coalesce(sum(amount), 0) from commission_week_pays where paid_at >= a0 and paid_at < a1),
    'cash_days', (select count(*) from txd),
    'cash_days_closed', (select count(*) from cc),
    'cash_days_unclosed', (select count(*) from txd where d not in (select date from cc) and d < jkt_today()),
    'cash_diff_total', (select coalesce(sum(difference), 0) from cc),
    'cash_diff_abs', (select coalesce(sum(abs(difference)), 0) from cc),
    'stock_purchases', (select coalesce(sum(round(qty * unit_cost)), 0)::bigint from stock_moves where type = 'in' and paid_from is not null and created_at >= a0 and created_at < a1),
    'payroll_paid', (select coalesce(sum(greatest(0, ps.total_pay - w.net - case when k.adjk <> 0 and ps.adjustments = k.adja then 0 else w.kasbon end)), 0)::bigint
                     from payroll_snapshots ps join payroll_periods pp on pp.id = ps.period_id
                     cross join lateral (select coalesce(sum(c.amount), 0) as net, coalesce(sum(c.kasbon), 0) as kasbon from commission_week_pays c
                                         where c.staff_id = ps.staff_id and c.month = pp.month) w
                     cross join lateral (select coalesce((select sum(e.amount) from expenses e where e.staff_id = ps.staff_id and e.category = 'kasbon' and e.voided_at is null
                                                          and e.adjustment_id is not null and date_trunc('month', e.date)::date = pp.month), 0) as adjk,
                                                coalesce((select sum(x.amount) from payroll_adjustments x where x.staff_id = ps.staff_id and x.month = pp.month), 0) as adja) k
                     where ps.paid_at >= a0 and ps.paid_at < a1),
    'campaign_sends', (select count(*) from campaign_sends where created_at >= a0 and created_at < a1),
    'campaign_recipients', (select coalesce(sum(recipient_count), 0) from campaign_sends where created_at >= a0 and created_at < a1)
  ) into r;
  return r;
end $function$;

-- DEFINISI LAMA (rollback; jalankan sebagai create or replace function owner_report_extra ... tanpa tanda komentar):
-- CREATE OR REPLACE FUNCTION public.owner_report_extra(p_from date, p_to date)
--  RETURNS jsonb
--  LANGUAGE plpgsql
--  STABLE SECURITY DEFINER
--  SET search_path TO 'public'
-- AS $function$
-- declare a0 timestamptz := jkt(p_from, '00:00'); a1 timestamptz := jkt(p_to + 1, '00:00'); r jsonb;
-- begin
--   perform require_role('manager');
--   with ap as (select * from appointments where start_at >= a0 and start_at < a1),
--   -- komisi estimasi: baris komisi bulan-bulan yang tersentuh periode, dipotong ke rentang tanggal (sebelum subsidi gaji minimum)
--   months as (select distinct date_trunc('month', g)::date as m from generate_series(p_from, p_to, interval '1 day') g),
--   cl as (select l.* from months, lateral commission_lines(months.m) l where l.created_at >= a0 and l.created_at < a1),
--   cc as (select distinct on (date) date, difference from cash_closings where date between p_from and p_to order by date, created_at desc),
--   txd as (select distinct (created_at at time zone 'Asia/Jakarta')::date as d from transactions where created_at >= a0 and created_at < a1 and voided_at is null)
--   select jsonb_build_object(
--     'bookings', (select count(*) filter (where status not in ('cancelled', 'pending_review')) from ap),
--     'bookings_paid', (select count(*) filter (where status = 'paid') from ap),
--     'bookings_cancelled', (select count(*) filter (where status = 'cancelled') from ap),
--     'bookings_no_show', (select count(*) filter (where status = 'no_show') from ap),
--     'bookings_walk_in', (select count(*) filter (where source = 'walk_in' and status <> 'cancelled') from ap),
--     'commission_est', (select coalesce(sum(commission), 0) from cl),
--     'hpp_items', (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id
--                   where t.voided_at is null and ti.category <> 'retail' and t.created_at >= a0 and t.created_at < a1),
--     'hpp_items_filled', (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id
--                          join transaction_item_costs c on c.transaction_item_id = ti.id
--                          where t.voided_at is null and ti.category <> 'retail' and c.hpp > 0 and t.created_at >= a0 and t.created_at < a1),
--     'subsidy_est', (select coalesce(round(sum(w.subsidy * (least(wk + 6, p_to) - greatest(wk, p_from) + 1) / 7.0)), 0)::bigint
--                     from generate_series(date_trunc('week', p_from)::date, p_to, interval '1 week') g(wk_ts),
--                          lateral (select g.wk_ts::date as wk) x, lateral commission_week_rows(x.wk) w),
--     'base_salary_est', (select coalesce(round(sum(s.base_salary::numeric / extract(day from date_trunc('month', d) + interval '1 month - 1 day'))), 0)::bigint
--                         from generate_series(p_from, p_to, interval '1 day') d
--                         join staff s on s.base_salary is not null and s.active and (s.created_at at time zone 'Asia/Jakarta')::date <= d::date),
--     'commission_weekly_paid', (select coalesce(sum(amount), 0) from commission_week_pays where paid_at >= a0 and paid_at < a1),
--     'cash_days', (select count(*) from txd),
--     'cash_days_closed', (select count(*) from cc),
--     'cash_days_unclosed', (select count(*) from txd where d not in (select date from cc) and d < jkt_today()),
--     'cash_diff_total', (select coalesce(sum(difference), 0) from cc),
--     'cash_diff_abs', (select coalesce(sum(abs(difference)), 0) from cc),
--     'stock_purchases', (select coalesce(sum(round(qty * unit_cost)), 0)::bigint from stock_moves where type = 'in' and paid_from is not null and created_at >= a0 and created_at < a1),
--     'payroll_paid', (select coalesce(sum(greatest(0, ps.total_pay - coalesce((select sum(c.amount) from commission_week_pays c
--                                                 where c.staff_id = ps.staff_id and c.month = pp.month), 0))), 0)::bigint
--                      from payroll_snapshots ps join payroll_periods pp on pp.id = ps.period_id
--                      where ps.paid_at >= a0 and ps.paid_at < a1),
--     'campaign_sends', (select count(*) from campaign_sends where created_at >= a0 and created_at < a1),
--     'campaign_recipients', (select coalesce(sum(recipient_count), 0) from campaign_sends where created_at >= a0 and created_at < a1)
--   ) into r;
--   return r;
-- end $function$;
