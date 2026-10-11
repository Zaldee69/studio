-- Komisi mingguan (Senin–Minggu): dihitung, ditutup, dan dibayar per minggu. Akhir bulan = penyelesaian:
-- gaji bulanan (komisi + subsidi gaji minimum + penyesuaian) − komisi yang sudah ditutup mingguan untuk bulan itu.
-- Tidak bisa bayar dobel, apa pun urutannya:
--   • minggu ditutup dulu → dikurangkan saat bulan diselesaikan;
--   • bulan ditutup dulu  → transaksi bulan itu tidak ikut lagi ke minggu mana pun.
-- Minggu yang melewati pergantian bulan dipecah per bulan (month). Void setelah minggu ditutup terkoreksi di akhir bulan.

create table commission_weeks (
  week_start date primary key check (extract(isodow from week_start) = 1),   -- Senin
  status text not null default 'closed' check (status in ('open', 'closed')),
  closed_by uuid default auth.uid(), closed_at timestamptz not null default now(),
  reopened_by uuid, reopened_at timestamptz, reopen_reason text
);

create table commission_week_pays (
  week_start date not null references commission_weeks (week_start) on delete cascade,
  staff_id uuid not null references staff (id),
  month date not null check (extract(day from month) = 1),
  service_count int not null,
  revenue_net bigint not null,
  commission_service bigint not null,
  commission_retail bigint not null,
  amount bigint not null,
  paid_at timestamptz, paid_method text check (paid_method in ('tunai', 'transfer')), paid_by uuid,
  primary key (week_start, staff_id, month)
);
create index commission_week_pays_month_idx on commission_week_pays (month, staff_id);

alter table commission_weeks enable row level security;
alter table commission_week_pays enable row level security;
create policy manager_read on commission_weeks for select to authenticated using (auth_role() = 'manager');
create policy staff_read on commission_weeks for select to authenticated using (auth_role() = 'staff');
create policy manager_read on commission_week_pays for select to authenticated using (auth_role() = 'manager');
create policy staff_own on commission_week_pays for select to authenticated using (auth_role() = 'staff' and staff_id = my_staff_id());

-- Rincian komisi minggu itu (live). Transaksi di bulan yang gajinya sudah ditutup tidak ikut (sudah dibayar bulanan).
create function commission_week_lines(p_week date)
returns table (staff_id uuid, month date, category service_category, net_amount bigint, commission bigint)
language sql stable security definer set search_path = public as $$
  with w as (select date_trunc('week', p_week)::date as d),
  m as (select distinct date_trunc('month', x)::date as month from w, lateral (values (w.d), (w.d + 6)) v(x))
  select l.staff_id, m.month, l.category, l.net_amount, l.commission
  from w, m, lateral commission_lines(m.month) l
  where l.created_at >= jkt(w.d, '00:00') and l.created_at < jkt(w.d + 7, '00:00')
    and not exists (select 1 from payroll_periods p where p.month = m.month and p.status = 'closed')
$$;

-- Ringkasan per staf untuk satu minggu: tertutup → angka beku; terbuka → live. Kapster: hanya dirinya.
create function commission_week(p_week date)
returns table (staff_id uuid, staff_name text, category staff_category, service_count int, revenue_net bigint,
               commission_service bigint, commission_retail bigint, amount bigint, closed boolean, paid_at timestamptz, paid_method text)
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
           sum(p.commission_retail)::bigint, sum(p.amount)::bigint, true, min(p.paid_at), min(p.paid_method)
    from commission_week_pays p join staff s on s.id = p.staff_id
    where p.week_start = w and (sid is null or p.staff_id = sid)
    group by s.id order by s.category, s.name;
  else
    return query
    select s.id, s.name, s.category,
           count(*) filter (where l.category <> 'retail')::int,
           coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint,
           coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint,
           coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint,
           coalesce(sum(l.commission), 0)::bigint, false, null::timestamptz, null::text
    from commission_week_lines(w) l join staff s on s.id = l.staff_id
    where sid is null or l.staff_id = sid
    group by s.id order by s.category, s.name;
  end if;
end $$;

-- Tutup minggu (setelah Minggu berakhir): bekukan komisi per staf per bulan.
create function commission_week_close(p_week date) returns int
language plpgsql security definer set search_path = public as $$
declare w date := date_trunc('week', p_week)::date; n int;
begin
  perform require_role('manager');
  if jkt(w + 7, '00:00') > now() then raise exception 'Minggu ini belum selesai (tutup setelah Minggu malam)'; end if;
  if exists (select 1 from commission_weeks where week_start = w and status = 'closed') then raise exception 'Minggu ini sudah ditutup'; end if;
  insert into commission_weeks (week_start) values (w)
  on conflict (week_start) do update set status = 'closed', closed_by = auth.uid(), closed_at = now();
  insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount)
  select w, l.staff_id, l.month,
         count(*) filter (where l.category <> 'retail'),
         coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0),
         coalesce(sum(l.commission) filter (where l.category = 'retail'), 0),
         coalesce(sum(l.commission), 0)
  from commission_week_lines(w) l group by l.staff_id, l.month;
  get diagnostics n = row_count;
  insert into notifications (target_role, target_user, kind, payload)
  select distinct 'staff'::app_role, p.id, 'payroll_ready', jsonb_build_object('week', w)
  from profiles p join commission_week_pays c on c.staff_id = p.staff_id and c.week_start = w where p.active;
  return n;
end $$;

create function commission_week_reopen(p_week date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare w date := date_trunc('week', p_week)::date;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan buka ulang wajib diisi'; end if;
  if not exists (select 1 from commission_weeks where week_start = w and status = 'closed') then raise exception 'Minggu ini belum ditutup'; end if;
  if exists (select 1 from commission_week_pays where week_start = w and paid_at is not null) then
    raise exception 'Sudah ada yang dibayar — minggu ini tidak bisa dibuka ulang';
  end if;
  if exists (select 1 from commission_week_pays c join payroll_periods p on p.month = c.month and p.status = 'closed' where c.week_start = w) then
    raise exception 'Gaji bulan terkait sudah ditutup — buka ulang bulan itu dulu';
  end if;
  delete from commission_week_pays where week_start = w;
  update commission_weeks set status = 'open', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(p_reason) where week_start = w;
end $$;

create function commission_week_mark_paid(p_week date, p_staff_id uuid, p_method text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if p_method not in ('tunai', 'transfer') then raise exception 'Metode bayar: tunai atau transfer'; end if;
  update commission_week_pays set paid_at = now(), paid_method = p_method, paid_by = auth.uid()
  where week_start = date_trunc('week', p_week)::date and staff_id = p_staff_id and paid_at is null;
  if not found then raise exception 'Tutup minggu dulu, atau komisi ini sudah ditandai dibayar'; end if;
end $$;

-- Untuk penyelesaian bulanan: komisi yang sudah ditutup mingguan (dan yang sudah dibayar) per staf di bulan itu.
create function commission_weekly_for_month(p_month date)
returns table (staff_id uuid, closed_amount bigint, paid_amount bigint, weeks int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare sid uuid;
begin
  perform require_role('manager', 'staff');
  sid := case when auth_role() = 'staff' then my_staff_id() else null end;
  return query
  select c.staff_id, sum(c.amount)::bigint, coalesce(sum(c.amount) filter (where c.paid_at is not null), 0)::bigint, count(distinct c.week_start)::int
  from commission_week_pays c
  where c.month = date_trunc('month', p_month)::date and (sid is null or c.staff_id = sid)
  group by c.staff_id;
end $$;

revoke execute on function commission_week_lines(date) from public, anon, authenticated;
