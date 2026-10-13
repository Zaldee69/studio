-- Jaring pendapatan harian per staf (opsional): staff.daily_min_pay. Untuk staf yang memakainya:
--   • hari kerja = hari staf melayani ≥1 layanan (bukan ritel), transaksi tidak di-void;
--   • subsidi hari itu = max(0, jaring harian − komisi hari itu) (komisi jasa + ritel);
--   • dibayar bersama komisi mingguan (dibekukan saat minggu ditutup);
--   • menggantikan jaring pengaman bulanan (min_monthly_pay) → gaji bulanan = komisi + subsidi harian + penyesuaian;
--     yang sudah dibayar mingguan (komisi + subsidi) dikurangkan di akhir bulan → tidak dobel.
-- Staf tanpa jaring harian tetap memakai jaring pengaman bulanan seperti sebelumnya.

alter table staff add column daily_min_pay bigint check (daily_min_pay > 0);
alter table commission_week_pays add column subsidy bigint not null default 0;

-- Subsidi harian per staf per bulan (bulan = bulan tanggal kerjanya), untuk rentang tanggal.
create function daily_net_subsidy(p_from date, p_to date)
returns table (staff_id uuid, month date, subsidy bigint, days int)
language sql stable security definer set search_path = public as $$
  with months as (select distinct date_trunc('month', g)::date as m from generate_series(p_from, p_to, interval '1 day') g),
  l as (select l.* from months, lateral commission_lines(months.m) l
        where l.created_at >= jkt(p_from, '00:00') and l.created_at < jkt(p_to + 1, '00:00')),
  d as (select l.staff_id, (l.created_at at time zone 'Asia/Jakarta')::date as day, sum(l.commission) as com,
               count(*) filter (where l.category <> 'retail') as svc
        from l group by 1, 2)
  select d.staff_id, date_trunc('month', d.day)::date, sum(greatest(0, s.daily_min_pay - d.com))::bigint,
         (count(*) filter (where s.daily_min_pay > d.com))::int
  from d join staff s on s.id = d.staff_id
  where s.daily_min_pay is not null and d.svc > 0
  group by 1, 2
$$;
revoke execute on function daily_net_subsidy(date, date) from public, anon, authenticated;

-- Gaji bulanan: staf berjaring harian → subsidi = total subsidi harian bulan itu (bukan jaring bulanan).
create or replace function commission_live(p_month date)
returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int,
               revenue_net bigint, hpp_total bigint, commission_service bigint, commission_retail bigint,
               subsidy bigint, adjustments bigint, total_pay bigint)
language sql stable security definer set search_path = public as $$
  with st as (select * from settings), l as (select * from commission_lines(p_month)),
  m as (select date_trunc('month', p_month)::date as m0),
  ds as (select x.staff_id, x.subsidy from m, lateral daily_net_subsidy(m.m0, (m.m0 + interval '1 month - 1 day')::date) x),
  agg as (
    select s.id, s.name, s.category, coalesce(s.commission_pct_override, st.commission_pct)::numeric as pct,
           count(l.*) filter (where l.category <> 'retail')::int as n,
           coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint as net,
           coalesce(sum(l.hpp) filter (where l.category <> 'retail'), 0)::bigint as hpp,
           coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint as cs,
           coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint as cr,
           coalesce((select sum(a.amount) from payroll_adjustments a where a.staff_id = s.id and a.month = date_trunc('month', p_month)::date), 0)::bigint as adj,
           st.min_monthly_pay as minpay, s.daily_min_pay is not null as daily, s.active, count(l.*) as any_items
    from staff s cross join st left join l on l.staff_id = s.id
    group by s.id, st.commission_pct, st.min_monthly_pay
  ),
  sub as (select agg.*, case when agg.daily then coalesce((select ds.subsidy from ds where ds.staff_id = agg.id), 0)
                             else greatest(0, agg.minpay - (agg.cs + agg.cr)) end::bigint as subsidy from agg)
  select id, name, category, pct, n, net, hpp, cs, cr, subsidy, adj, (cs + cr + subsidy + adj)::bigint
  from sub where active or any_items > 0 or adj <> 0
$$;

-- Komisi mingguan: + kolom subsidi (jaring harian). Tertutup → angka beku; terbuka → live.
drop function commission_week(date);
create function commission_week(p_week date)
returns table (staff_id uuid, staff_name text, category staff_category, service_count int, revenue_net bigint,
               commission_service bigint, commission_retail bigint, subsidy bigint, amount bigint, closed boolean, paid_at timestamptz, paid_method text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare w date := date_trunc('week', p_week)::date; sid uuid; is_closed boolean;
begin
  perform require_role('manager', 'staff');
  sid := case when auth_role() = 'staff' then my_staff_id() else null end;
  if auth_role() = 'staff' and sid is null then raise exception 'Akun belum ditautkan ke staf'; end if;
  is_closed := exists (select 1 from commission_weeks cw where cw.week_start = w and cw.status = 'closed');
  if is_closed then
    return query
    select s.id, s.name, s.category, sum(p.service_count)::int, sum(p.revenue_net)::bigint, sum(p.commission_service)::bigint,
           sum(p.commission_retail)::bigint, sum(p.subsidy)::bigint, sum(p.amount)::bigint, true, min(p.paid_at), min(p.paid_method)
    from commission_week_pays p join staff s on s.id = p.staff_id
    where p.week_start = w and (sid is null or p.staff_id = sid)
    group by s.id order by s.category, s.name;
  else
    return query
    with l as (select * from commission_week_lines(w)),
    ds as (select x.staff_id, sum(x.subsidy) as subsidy from daily_net_subsidy(w, w + 6) x
           where not exists (select 1 from payroll_periods p where p.month = x.month and p.status = 'closed') group by 1)
    select s.id, s.name, s.category,
           count(*) filter (where l.category <> 'retail')::int,
           coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint,
           coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint,
           coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint,
           coalesce(max(ds.subsidy), 0)::bigint,
           (coalesce(sum(l.commission), 0) + coalesce(max(ds.subsidy), 0))::bigint, false, null::timestamptz, null::text
    from l join staff s on s.id = l.staff_id left join ds on ds.staff_id = s.id
    where sid is null or l.staff_id = sid
    group by s.id order by s.category, s.name;
  end if;
end $$;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('commission_week_close'::regproc) into def;
  old := def;
  def := replace(def, $a$  insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount)
  select w, l.staff_id, l.month,
         count(*) filter (where l.category <> 'retail'),
         coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category = 'retail'), 0),
         coalesce(sum(l.commission), 0)
  from commission_week_lines(w) l group by l.staff_id, l.month;$a$,
  $a$  insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, subsidy, amount)
  select w, l.staff_id, l.month,
         count(*) filter (where l.category <> 'retail'),
         coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category = 'retail'), 0),
         coalesce(max(ds.subsidy), 0),
         coalesce(sum(l.commission), 0) + coalesce(max(ds.subsidy), 0)
  from commission_week_lines(w) l
  left join daily_net_subsidy(w, w + 6) ds on ds.staff_id = l.staff_id and ds.month = l.month
  group by l.staff_id, l.month;$a$);
  if def = old then raise exception 'Patch commission_week_close tidak menemukan teks'; end if;
  execute def;

  select pg_get_functiondef('staff_commission_terms'::regproc) into def;
  old := def;
  def := replace(def, $a$'basis', st.commission_basis)$a$, $a$'basis', st.commission_basis, 'daily_min', s.daily_min_pay)$a$);
  if def = old then raise exception 'Patch staff_commission_terms tidak menemukan teks'; end if;
  execute def;
end $$;
