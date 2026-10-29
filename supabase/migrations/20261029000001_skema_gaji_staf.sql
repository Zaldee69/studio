-- Skema bayaran per staf (untuk capster baru, mis. Nicko: gaji pokok 3 jt + 30% setelah HPP + ritel 10%, dibayar bulanan):
--   • staff.base_salary        gaji pokok per bulan; staf bergaji pokok tidak memakai jaring pengaman bulanan
--   • staff.pay_monthly        true → komisi tidak ikut tutup/bayar mingguan, semuanya dibayar di gaji akhir bulan
--   • staff.deduct_hpp         potong HPP dari komisi jasa; null = ikut pengaturan global
--   • staff.retail_pct_override komisi ritel (%); null = ikut pengaturan global
-- Staf lama (semua kolom kosong/false) dihitung persis seperti sebelumnya.

alter table staff
  add column base_salary bigint check (base_salary > 0),
  add column pay_monthly boolean not null default false,
  add column deduct_hpp boolean,
  add column retail_pct_override numeric check (retail_pct_override between 0 and 100);
alter table payroll_snapshots add column base_salary bigint not null default 0;

do $$
declare def text; old text;
begin
  -- komisi per baris: HPP & ritel per staf
  select pg_get_functiondef('commission_lines'::regproc) into def;
  old := def;
  def := replace(def, $a$case when st.commission_deduct_hpp then$a$, $a$case when coalesce(s.deduct_hpp, st.commission_deduct_hpp) then$a$);
  def := replace(def, $a$then st.retail_commission_pct$a$, $a$then coalesce(s.retail_pct_override, st.retail_commission_pct)$a$);
  if def = old or def !~ 's\.deduct_hpp' or def !~ 's\.retail_pct_override' then raise exception 'Patch commission_lines tidak menemukan teks'; end if;
  execute def;

  -- staf bayar bulanan tidak masuk komisi mingguan (rekap, tutup minggu, rapor WA)
  select pg_get_functiondef('commission_week_rows'::regproc) into def;
  old := def;
  def := replace(def, $a$l as (select l.* from w, lateral commission_week_lines(w.w0) l),$a$,
    $a$l as (select l.* from w, lateral commission_week_lines(w.w0) l
        where not exists (select 1 from staff s where s.id = l.staff_id and s.pay_monthly)),$a$);
  if def = old then raise exception 'Patch commission_week_rows tidak menemukan teks'; end if;
  execute def;

  -- rapor WA mingguan: staf bayar bulanan melihat komisi minggu itu, bukan "Bayaran"
  select pg_get_functiondef('staff_weekly_report'::regproc) into def;
  old := def;
  def := replace(def, $a$\nBayaran: %s\n$a$, $a$\n%s\n$a$);
  def := replace(def, $a$fmt_rp(coalesce(pay.amt, 0)))$a$,
    $a$case when st.pay_monthly then 'Komisi minggu ini: ' || fmt_rp(coalesce(cm.amt, 0)) || ' (dibayar bersama gaji akhir bulan)'
                 else 'Bayaran: ' || fmt_rp(coalesce(pay.amt, 0)) end)$a$);
  def := replace(def, $a$  ), pay as (select staff_id, sum(amount)::bigint as amt from commission_week_rows(w) group by staff_id),$a$,
    $a$  ), pay as (select staff_id, sum(amount)::bigint as amt from commission_week_rows(w) group by staff_id),
  cm as (select staff_id, sum(commission)::bigint as amt from commission_week_lines(w) group by staff_id),$a$);
  def := replace(def, $a$    left join pay on pay.staff_id = st.id$a$, $a$    left join pay on pay.staff_id = st.id left join cm on cm.staff_id = st.id$a$);
  if def = old or def !~ 'cm\.amt' or def !~ 'left join cm' or def !~ 'cm as \(' then raise exception 'Patch staff_weekly_report tidak menemukan teks'; end if;
  execute def;
end $$;

-- Gaji bulanan: + gaji pokok. Bergaji pokok → tanpa subsidi jaring pengaman bulanan.
drop function commission_for_period(date, uuid);
drop function commission_live(date);
create function commission_live(p_month date)
returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int,
               revenue_net bigint, hpp_total bigint, base_salary bigint, commission_service bigint, commission_retail bigint,
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
           st.min_monthly_pay as minpay, s.daily_min_pay is not null as daily, s.base_salary, s.active, count(l.*) as any_items
    from staff s cross join st left join l on l.staff_id = s.id
    group by s.id, st.commission_pct, st.min_monthly_pay
  ),
  sub as (select agg.*, case when agg.base_salary is not null then 0
                             when agg.daily then coalesce((select ds.subsidy from ds where ds.staff_id = agg.id), 0)
                             else greatest(0, agg.minpay - (agg.cs + agg.cr)) end::bigint as subsidy,
                        coalesce(agg.base_salary, 0)::bigint as base from agg)
  select id, name, category, pct, n, net, hpp, base, cs, cr, subsidy, adj, (base + cs + cr + subsidy + adj)::bigint
  from sub where active or any_items > 0 or adj <> 0
$$;
revoke execute on function commission_live(date) from public, anon, authenticated;

create function commission_for_period(p_month date, p_staff_id uuid default null)
returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int, revenue_net bigint,
               hpp_total bigint, base_salary bigint, commission_service bigint, commission_retail bigint, subsidy bigint, adjustments bigint,
               total_pay bigint, closed boolean, paid_at timestamptz, paid_method text, note text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare per payroll_periods; sid uuid;
begin
  perform require_role('manager', 'staff');
  sid := case when auth_role() = 'staff' then my_staff_id() else p_staff_id end;
  if auth_role() = 'staff' and sid is null then raise exception 'Akun belum ditautkan ke staf'; end if;
  select * into per from payroll_periods where month = date_trunc('month', p_month)::date;
  if per.status = 'closed' then
    return query
    select s.staff_id, s.staff_name, s.category, s.commission_pct, s.service_count, s.revenue_net,
           case when auth_role() = 'manager' then s.hpp_total end, s.base_salary, s.commission_service, s.commission_retail,
           s.subsidy, s.adjustments, s.total_pay, true, s.paid_at, s.paid_method, s.note
    from payroll_snapshots s where s.period_id = per.id and (sid is null or s.staff_id = sid)
    order by s.category, s.staff_name;
  else
    return query
    select c.staff_id, c.staff_name, c.category, c.commission_pct, c.service_count, c.revenue_net,
           case when auth_role() = 'manager' then c.hpp_total end, c.base_salary, c.commission_service, c.commission_retail,
           c.subsidy, c.adjustments, c.total_pay, false, null::timestamptz, null::text, ''::text
    from commission_live(p_month) c where sid is null or c.staff_id = sid
    order by c.category, c.staff_name;
  end if;
end $$;

create or replace function payroll_close(p_month date)
returns integer language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; pid uuid; n int;
begin
  perform require_role('manager');
  if m > date_trunc('month', jkt_today())::date then raise exception 'Periode di masa depan belum bisa ditutup'; end if;
  insert into payroll_periods (month) values (m) on conflict (month) do nothing;
  select id into pid from payroll_periods where month = m and status = 'open' for update;
  if pid is null then raise exception 'Periode sudah ditutup'; end if;
  insert into payroll_snapshots (period_id, staff_id, staff_name, category, commission_pct, service_count, revenue_net, hpp_total,
                                 base_salary, commission_service, commission_retail, subsidy, adjustments, total_pay)
  select pid, c.staff_id, c.staff_name, c.category, c.commission_pct, c.service_count, c.revenue_net, c.hpp_total,
         c.base_salary, c.commission_service, c.commission_retail, c.subsidy, c.adjustments, c.total_pay
  from commission_live(m) c;
  get diagnostics n = row_count;
  update payroll_periods set status = 'closed', closed_by = auth.uid(), closed_at = now() where id = pid;
  insert into notifications (target_role, target_user, kind, payload)
  select 'staff', p.id, 'payroll_ready', jsonb_build_object('month', m)
  from profiles p join payroll_snapshots s on s.staff_id = p.staff_id and s.period_id = pid where p.active;
  return n;
end $$;

-- Ketentuan yang dilihat staf sendiri (halaman Komisi kapster): nilai efektif per staf.
create or replace function staff_commission_terms()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ratio', coalesce(s.commission_pct_override, st.commission_pct),
                            'min_pay', case when s.base_salary is null then st.min_monthly_pay else 0 end,
                            'retail_pct', coalesce(s.retail_pct_override, st.retail_commission_pct), 'basis', st.commission_basis,
                            'daily_min', s.daily_min_pay, 'deduct_hpp', coalesce(s.deduct_hpp, st.commission_deduct_hpp),
                            'base_salary', s.base_salary, 'pay_monthly', s.pay_monthly)
  from staff s, settings st where s.id = my_staff_id()
$$;
