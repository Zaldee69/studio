-- Kasbon dipotong di komisi mingguan (bukan menunggu akhir bulan):
--   • saat minggu ditutup, kasbon staf (pengeluaran kategori kasbon, tidak dibatalkan, tanggal ≤ akhir minggu) yang belum
--     dipotong minggu sebelumnya dipotong dari bayaran minggu itu — maksimal sebesar bayarannya (sisa dibawa ke minggu berikutnya);
--   • kasbon tetap tercatat sebagai potongan bulanan (payroll_adjustments) → total gaji bulanan sudah termasuk potongannya,
--     dan yang dibayar mingguan (sudah dipotong kasbon) dikurangkan di akhir bulan → kasbon terpotong tepat sekali;
--   • kasbon yang dibatalkan setelah terpotong: koreksi +jumlah di bulanan mengembalikannya.
alter table commission_week_pays add column kasbon bigint not null default 0;

-- Rincian bayaran mingguan per staf per bulan (dasar tampilan live & penutupan minggu).
create function commission_week_rows(p_week date)
returns table (staff_id uuid, month date, service_count int, revenue_net bigint, commission_service bigint, commission_retail bigint,
               subsidy bigint, kasbon bigint, amount bigint)
language sql stable security definer set search_path = public as $$
  with w as (select date_trunc('week', p_week)::date as w0),
  l as (select l.* from w, lateral commission_week_lines(w.w0) l),
  ds as (select x.* from w, lateral daily_net_subsidy(w.w0, w.w0 + 6) x),
  g as (select l.staff_id, l.month,
               count(*) filter (where l.category <> 'retail')::int as sc,
               coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint as net,
               coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint as cs,
               coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint as cr,
               coalesce(max(ds.subsidy), 0)::bigint as sub
        from l left join ds on ds.staff_id = l.staff_id and ds.month = l.month group by 1, 2),
  k as (select e.staff_id, date_trunc('month', e.date)::date as month, sum(e.amount) as amt
        from expenses e, w where e.category = 'kasbon' and e.voided_at is null and e.date <= w.w0 + 6 group by 1, 2),
  prev as (select p.staff_id, p.month, sum(p.kasbon) as amt from commission_week_pays p, w where p.week_start <> w.w0 group by 1, 2),
  r as (select g.*, least(g.cs + g.cr + g.sub, greatest(0, coalesce(k.amt, 0) - coalesce(prev.amt, 0)))::bigint as kas
        from g left join k on k.staff_id = g.staff_id and k.month = g.month
               left join prev on prev.staff_id = g.staff_id and prev.month = g.month)
  select staff_id, month, sc, net, cs, cr, sub, kas, (cs + cr + sub - kas)::bigint from r
$$;
revoke execute on function commission_week_rows(date) from public, anon, authenticated;

drop function commission_week(date);
create function commission_week(p_week date)
returns table (staff_id uuid, staff_name text, category staff_category, service_count int, revenue_net bigint,
               commission_service bigint, commission_retail bigint, subsidy bigint, kasbon bigint, amount bigint,
               closed boolean, paid_at timestamptz, paid_method text)
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
           sum(p.commission_retail)::bigint, sum(p.subsidy)::bigint, sum(p.kasbon)::bigint, sum(p.amount)::bigint, true, min(p.paid_at), min(p.paid_method)
    from commission_week_pays p join staff s on s.id = p.staff_id
    where p.week_start = w and (sid is null or p.staff_id = sid)
    group by s.id order by s.category, s.name;
  else
    return query
    select s.id, s.name, s.category, sum(r.service_count)::int, sum(r.revenue_net)::bigint, sum(r.commission_service)::bigint,
           sum(r.commission_retail)::bigint, sum(r.subsidy)::bigint, sum(r.kasbon)::bigint, sum(r.amount)::bigint, false, null::timestamptz, null::text
    from commission_week_rows(w) r join staff s on s.id = r.staff_id
    where sid is null or r.staff_id = sid
    group by s.id order by s.category, s.name;
  end if;
end $$;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('commission_week_close'::regproc) into def;
  old := def;
  def := replace(def, $a$  insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, subsidy, amount)
  select w, l.staff_id, l.month,
         count(*) filter (where l.category <> 'retail'),
         coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category = 'retail'), 0),
         coalesce(max(ds.subsidy), 0),
         coalesce(sum(l.commission), 0) + coalesce(max(ds.subsidy), 0)
  from commission_week_lines(w) l
  left join daily_net_subsidy(w, w + 6) ds on ds.staff_id = l.staff_id and ds.month = l.month
  group by l.staff_id, l.month;$a$,
  $a$  insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, subsidy, kasbon, amount)
  select w, r.staff_id, r.month, r.service_count, r.revenue_net, r.commission_service, r.commission_retail, r.subsidy, r.kasbon, r.amount
  from commission_week_rows(w) r;$a$);
  if def = old then raise exception 'Patch commission_week_close tidak menemukan teks'; end if;
  execute def;
end $$;
