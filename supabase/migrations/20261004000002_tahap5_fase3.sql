-- Tahap 5 (Fase 3): Analitik KPI · SOP & Kepatuhan.
-- Prinsip: satu definisi per KPI (fungsi SQL, dicerminkan di src/lib/domain/kpi.ts) · void diabaikan · Asia/Jakarta
-- · SOP = catatan audit (siapa & kapan, tanpa hapus, terkunci setelah otorisasi).

-- =====================================================================================================
-- 2.1 Pengaturan
-- =====================================================================================================
alter table settings
  add column kpi_min_tx_for_stable int not null default 10 check (kpi_min_tx_for_stable >= 0),
  add column insight_aov_gap_pct numeric not null default 10 check (insight_aov_gap_pct >= 0),
  add column insight_low_util_pct numeric not null default 10 check (insight_low_util_pct >= 0),
  add column return_window_days int not null default 60 check (return_window_days > 0),
  add column followup_window_days int not null default 30 check (followup_window_days > 0),
  add column sop_shifts int not null default 1 check (sop_shifts in (1, 2)),
  add column sop_shift_names text[] not null default '{Pagi,Sore}',
  add column sop_reminder_time time not null default '12:00',
  add column sop_require_photo_autoclave boolean not null default false;

-- =====================================================================================================
-- 2.2 No-show & follow-up
-- =====================================================================================================
-- Tidak datang: hanya booking booked|arrived yang jamnya sudah lewat. Koreksi balik lewat set_appointment_status.
create function mark_no_show(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  update appointments set status = 'no_show' where id = p_id and status in ('booked', 'arrived') and start_at < now();
  if not found then raise exception 'Hanya booking yang jamnya sudah lewat & belum dilayani yang bisa ditandai tidak datang'; end if;
end $$;

create or replace function set_appointment_status(p_id uuid, p_status appt_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  if p_status in ('paid', 'cancelled', 'pending_review', 'no_show') then raise exception 'Gunakan kasir / batalkan / terima booking / tidak datang'; end if;
  update appointments set status = p_status where id = p_id and status not in ('paid', 'cancelled', 'pending_review');
  if not found then raise exception 'Booking tidak ditemukan, sudah lunas, dibatalkan, atau menunggu persetujuan'; end if;
end $$;

create table followup_events (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  sent_by uuid default auth.uid(),
  channel text not null default 'whatsapp' check (channel = 'whatsapp'),
  created_at timestamptz not null default now()
);
create index followup_events_customer_idx on followup_events (customer_id, created_at);
alter table followup_events enable row level security;
create policy manager_read on followup_events for select to authenticated using (auth_role() = 'manager');
create policy front_insert on followup_events for insert to authenticated
  with check (auth_role() in ('manager', 'cashier') and sent_by = auth.uid() and channel = 'whatsapp');

-- =====================================================================================================
-- 2.3 SOP & perawatan
-- =====================================================================================================
alter table sop_tool_groups add column description text not null default '';
alter table sop_logs
  add column shift smallint not null default 1 check (shift in (1, 2)),
  add column note text not null default '',
  add column photo_path text,
  add column on_behalf_staff_id uuid references staff (id),
  add column undone_at timestamptz,
  add column undone_by uuid;
alter table sop_logs drop constraint sop_logs_date_group_id_stage_key;
create unique index sop_logs_active_key on sop_logs (date, shift, group_id, stage) where undone_at is null;
alter table sop_approvals
  add column shift smallint not null default 1 check (shift in (1, 2));
alter table sop_approvals drop constraint sop_approvals_date_key;
alter table sop_approvals add constraint sop_approvals_date_shift_key unique (date, shift);

-- Terkunci per tanggal + shift setelah otorisasi; tidak pernah dihapus (pembatalan = undone_at).
create or replace function guard_sop_locked() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Log SOP tidak bisa dihapus — gunakan Batalkan'; end if;
  if exists (select 1 from sop_approvals where date = new.date and shift = new.shift) then
    raise exception 'Checklist tanggal ini sudah diotorisasi';
  end if;
  if tg_op = 'UPDATE' and (to_jsonb(new) - 'undone_at' - 'undone_by') <> (to_jsonb(old) - 'undone_at' - 'undone_by') then
    raise exception 'Log SOP hanya bisa dibatalkan, tidak diubah';
  end if;
  return new;
end $$;
create function guard_sop_approval() returns trigger language plpgsql as $$
begin raise exception 'Otorisasi SOP tidak bisa diubah atau dihapus'; end $$;
create trigger sop_approvals_immutable before update or delete on sop_approvals
  for each row execute function guard_sop_approval();

alter table maintenance_tasks
  add column assignee_staff_id uuid references staff (id) on delete set null,
  add column procedure text not null default '';
alter table maintenance_logs
  add column photo_path text,
  add column cost bigint check (cost >= 0),
  add column vendor text;

-- RLS: kapster hanya hari ini (log & otorisasi); biaya perawatan hanya manajer (kapster baca lewat maintenance_status).
drop policy sop_read on sop_logs;
drop policy sop_read on sop_approvals;
drop policy maint_read on maintenance_logs;
drop policy maint_insert on maintenance_logs;
create policy manager_read on sop_logs for select to authenticated using (auth_role() = 'manager');
create policy staff_today on sop_logs for select to authenticated using (auth_role() = 'staff' and date = jkt_today());
create policy manager_read on sop_approvals for select to authenticated using (auth_role() = 'manager');
create policy staff_today on sop_approvals for select to authenticated using (auth_role() = 'staff' and date = jkt_today());
create policy manager_read on maintenance_logs for select to authenticated using (auth_role() = 'manager');
create policy manager_update on maintenance_logs for update to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');

-- Foto SOP & perawatan (privat): path "<tanggal>/<uid>/<file>". Kapster menulis foto sendiri & membaca hari ini.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sop', 'sop', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;
create policy sop_manager_all on storage.objects for all to authenticated
  using (bucket_id = 'sop' and auth_role() = 'manager') with check (bucket_id = 'sop' and auth_role() = 'manager');
create policy sop_staff_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'sop' and auth_role() = 'staff' and (storage.foldername(name))[1] = jkt_today()::text
              and (storage.foldername(name))[2] = auth.uid()::text);
create policy sop_staff_read on storage.objects for select to authenticated
  using (bucket_id = 'sop' and auth_role() = 'staff' and (storage.foldername(name))[1] = jkt_today()::text);

alter publication supabase_realtime add table sop_approvals, maintenance_logs;

-- =====================================================================================================
-- 2.4 Agregasi (materialized view + refresh ter-debounce)
-- =====================================================================================================
-- Satu definisi agregasi (P1): fungsi berparameter rentang waktu. MV = fungsi atas seluruh waktu; "hari ini" = fungsi
-- yang sama atas rentang hari ini (memakai indeks created_at/start_at, bukan mengagregasi ulang 12 bulan).
-- Per hari × kategori (× staf). Kategori semu: 'service' (barber+nail) & 'all'. tx_count = transaksi yang memuat ≥1 item kategori itu.
create function sales_rows(p_a timestamptz, p_b timestamptz)
returns table (day date, category text, staff_id uuid, by_staff boolean, tx_count int, revenue_net bigint, item_count int, upsell_tx int, bundle_tx int)
language sql stable security definer set search_path = public as $$
  with items as (
    select t.id as tx, (t.created_at at time zone 'Asia/Jakarta')::date as day, ti.staff_id, ti.net_amount, ti.from_upsell,
           t.discount_amount > 0 as bundle, c.cat
    from transactions t
    join transaction_items ti on ti.transaction_id = t.id
    cross join lateral (values (ti.category::text), (case when ti.category <> 'retail' then 'service' end), ('all')) c(cat)
    where t.voided_at is null and c.cat is not null and t.created_at >= p_a and t.created_at < p_b
  )
  select day, cat, coalesce(staff_id, '00000000-0000-0000-0000-000000000000'::uuid), grouping(staff_id) = 0,
         count(distinct tx)::int, sum(net_amount)::bigint, count(*)::int,
         count(distinct tx) filter (where from_upsell)::int, count(distinct tx) filter (where bundle)::int
  from items group by grouping sets ((day, cat), (day, cat, staff_id))
$$;
create materialized view mv_daily_sales as select * from sales_rows('-infinity', 'infinity');
create unique index mv_daily_sales_key on mv_daily_sales (day, category, by_staff, staff_id);

-- Menit terjual per appointment: nyata (selesai − mulai) bila ada, berjalan → sampai sekarang (maks jam tutup), selain itu rencana.
create function appt_minutes(a appointments, p_now timestamptz) returns numeric language sql stable set search_path = public as $$
  select case
    when a.service_started_at is not null and a.service_ended_at is not null
      then extract(epoch from a.service_ended_at - a.service_started_at) / 60
    when a.status = 'in_service' and a.service_started_at is not null then greatest(0, extract(epoch from
      least(p_now, coalesce((select jkt((a.start_at at time zone 'Asia/Jakarta')::date, make_time(w.close_m / 60, w.close_m % 60, 0))
                                   from day_window((a.start_at at time zone 'Asia/Jakarta')::date) w), a.end_at)) - a.service_started_at) / 60)
    else a.duration_min end
$$;

create function resource_rows(p_a timestamptz, p_b timestamptz)
returns table (day date, resource_id uuid, staff_id uuid, sold_minutes numeric, planned_minutes numeric, n_actual int, actual_minus_planned numeric)
language sql stable security definer set search_path = public as $$
  select (a.start_at at time zone 'Asia/Jakarta')::date, a.resource_id, coalesce(a.staff_id, '00000000-0000-0000-0000-000000000000'::uuid),
         sum(appt_minutes(a, now()))::numeric, sum(a.duration_min)::numeric,
         count(*) filter (where a.service_started_at is not null and a.service_ended_at is not null)::int,
         coalesce(sum(extract(epoch from a.service_ended_at - a.service_started_at) / 60 - a.duration_min)
                  filter (where a.service_started_at is not null and a.service_ended_at is not null), 0)::numeric
  from appointments a
  where a.status in ('in_service', 'completed', 'paid') and a.start_at >= p_a and a.start_at < p_b
  group by 1, 2, 3
$$;
create materialized view mv_daily_resource_minutes as select * from resource_rows('-infinity', 'infinity');
create unique index mv_daily_resource_minutes_key on mv_daily_resource_minutes (day, resource_id, staff_id);

create table analytics_refresh (id boolean primary key default true check (id), dirty boolean not null default false, refreshed_at timestamptz);
insert into analytics_refresh values (true, false, now());
alter table analytics_refresh enable row level security;

create function mark_analytics_dirty() returns trigger language plpgsql security definer set search_path = public as $$
begin update analytics_refresh set dirty = true where not dirty; return null; end $$;
create trigger transactions_analytics_dirty after insert or update on transactions for each statement execute function mark_analytics_dirty();
create trigger appointments_analytics_dirty after update of status on appointments for each statement execute function mark_analytics_dirty();

-- Dipanggil pg_cron: tiap menit bila ada perubahan (debounce), tiap 15 menit dipaksa.
create function refresh_analytics(p_force boolean default false) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not p_force and not (select dirty from analytics_refresh) then return; end if;
  update analytics_refresh set dirty = false;
  refresh materialized view concurrently mv_daily_sales;
  refresh materialized view concurrently mv_daily_resource_minutes;
  update analytics_refresh set refreshed_at = now();
end $$;
select cron.schedule('gb-analytics-debounce', '* * * * *', $$select public.refresh_analytics(false)$$);
select cron.schedule('gb-analytics-15m', '*/15 * * * *', $$select public.refresh_analytics(true)$$);

-- Sumber harian untuk semua KPI: MV untuk hari lampau, live untuk hari ini (P1: definisi sama, lihat v_*).
create function daily_sales(p_from date, p_to date) returns setof mv_daily_sales language sql stable security definer set search_path = public as $$
  select * from mv_daily_sales where day between p_from and least(p_to, jkt_today() - 1)
  union all
  select * from sales_rows(jkt(jkt_today(), '00:00'), jkt(jkt_today() + 1, '00:00')) where p_from <= jkt_today() and p_to >= jkt_today()
$$;
create function daily_resource_minutes(p_from date, p_to date) returns setof mv_daily_resource_minutes language sql stable security definer set search_path = public as $$
  select * from mv_daily_resource_minutes where day between p_from and least(p_to, jkt_today() - 1)
  union all
  select * from resource_rows(jkt(jkt_today(), '00:00'), jkt(jkt_today() + 1, '00:00')) where p_from <= jkt_today() and p_to >= jkt_today()
$$;
-- Menit buka per hari (jam per hari; libur/tutup = 0).
create function open_minutes(p_from date, p_to date) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(w.close_m - w.open_m), 0) from generate_series(p_from, p_to, interval '1 day') g(d) cross join lateral day_window(g.d::date) w
$$;

-- =====================================================================================================
-- 3. Fungsi KPI (manajer). Periode inklusif p_from..p_to (Asia/Jakarta).
-- =====================================================================================================
create function kpi_period(p_from date, p_to date, p_category text default null, p_staff uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; sold numeric; avail numeric; n_res int;
begin
  with s as (
    select * from daily_sales(p_from, p_to) where by_staff = (p_staff is not null) and (p_staff is null or staff_id = p_staff)
  ), c as (
    select category, sum(tx_count)::int as tx, sum(revenue_net)::bigint as rev from s group by category
  )
  select jsonb_build_object(
    'omzet', coalesce((select rev from c where category = coalesce(p_category, 'all')), 0),
    'tx_count', coalesce((select tx from c where category = coalesce(p_category, 'all')), 0),
    'tx_barbershop', coalesce((select tx from c where category = 'barbershop'), 0),
    'tx_nail', coalesce((select tx from c where category = 'nail'), 0),
    'rev_barbershop', coalesce((select rev from c where category = 'barbershop'), 0),
    'rev_nail', coalesce((select rev from c where category = 'nail'), 0),
    'rev_retail', coalesce((select rev from c where category = 'retail'), 0),
    'rev_service', coalesce((select rev from c where category = 'service'), 0)) into r;
  select coalesce(sum(m.sold_minutes), 0) into sold from daily_resource_minutes(p_from, p_to) m join resources x on x.id = m.resource_id
  where (p_category is null or x.type::text = p_category) and (p_staff is null or m.staff_id = p_staff);
  select count(*) into n_res from resources where active and (p_category is null or type::text = p_category);
  avail := open_minutes(p_from, p_to) * case when p_staff is null then n_res else 1 end;
  return r || jsonb_build_object(
    'aov_all', case when (r ->> 'tx_count')::int > 0 then round((r ->> 'omzet')::numeric / (r ->> 'tx_count')::int) end,
    'aov_barbershop', case when (r ->> 'tx_barbershop')::int > 0 then round((r ->> 'rev_barbershop')::numeric / (r ->> 'tx_barbershop')::int) end,
    'aov_nail', case when (r ->> 'tx_nail')::int > 0 then round((r ->> 'rev_nail')::numeric / (r ->> 'tx_nail')::int) end,
    'retail_ratio', case when p_category is null and (r ->> 'rev_service')::bigint > 0 then (r ->> 'rev_retail')::numeric * 100 / (r ->> 'rev_service')::bigint end,
    'utilization_avg', case when avail > 0 then sold * 100 / avail end,
    'sold_minutes', sold, 'available_minutes', avail);
end $$;

create function kpi_summary(p_from date, p_to date, p_category text default null, p_staff_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare len int := p_to - p_from + 1; cur jsonb; prev jsonb; d jsonb := '{}'; k text; st settings;
begin
  perform require_role('manager');
  select * into st from settings;
  cur := kpi_period(p_from, p_to, p_category, p_staff_id);
  prev := kpi_period(p_from - len, p_from - 1, p_category, p_staff_id);
  foreach k in array array['omzet', 'tx_count', 'aov_all', 'aov_barbershop', 'aov_nail', 'retail_ratio', 'utilization_avg'] loop
    d := d || jsonb_build_object(k, case when coalesce((prev ->> k)::numeric, 0) = 0 then null
                                         else ((cur ->> k)::numeric - (prev ->> k)::numeric) * 100 / (prev ->> k)::numeric end);
  end loop;
  return jsonb_build_object('from', p_from, 'to', p_to, 'prev_from', p_from - len, 'prev_to', p_from - 1,
    'current', cur, 'previous', prev, 'delta', d,
    'targets', jsonb_build_object('aov_barbershop', st.aov_target_barbershop, 'aov_nail', st.aov_target_nail,
      'retail_min', st.retail_ratio_min, 'retail_max', st.retail_ratio_max, 'utilization', st.utilization_target,
      'min_tx', st.kpi_min_tx_for_stable));
end $$;

create function kpi_aov_daily(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (day date, aov_barbershop bigint, aov_nail bigint, tx_barbershop int, tx_nail int, omzet bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_role('manager');
  return query
  with s as (select * from daily_sales(p_from, p_to) where by_staff = (p_staff_id is not null) and (p_staff_id is null or staff_id = p_staff_id))
  select g.d::date,
    (select round(sum(revenue_net)::numeric / nullif(sum(tx_count), 0))::bigint from s where s.day = g.d and category = 'barbershop' and coalesce(p_category, 'barbershop') = 'barbershop'),
    (select round(sum(revenue_net)::numeric / nullif(sum(tx_count), 0))::bigint from s where s.day = g.d and category = 'nail' and coalesce(p_category, 'nail') = 'nail'),
    coalesce((select sum(tx_count)::int from s where s.day = g.d and category = 'barbershop'), 0),
    coalesce((select sum(tx_count)::int from s where s.day = g.d and category = 'nail'), 0),
    coalesce((select sum(revenue_net)::bigint from s where s.day = g.d and category = coalesce(p_category, 'all')), 0)
  from generate_series(p_from, p_to, interval '1 day') g(d) order by 1;
end $$;

-- Penggerak AOV per kelompok: rata-rata layanan/transaksi, tingkat upsell, % bundle (atas transaksi berlayanan).
create function kpi_aov_drivers(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (category text, tx_count int, avg_services numeric, upsell_rate numeric, bundle_pct numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_role('manager');
  return query
  select c.cat, coalesce(sum(s.tx_count), 0)::int,
         sum(s.item_count)::numeric / nullif(sum(s.tx_count), 0),
         sum(s.upsell_tx)::numeric * 100 / nullif(sum(s.tx_count), 0),
         sum(s.bundle_tx)::numeric * 100 / nullif(sum(s.tx_count), 0)
  from unnest(array['service', 'barbershop', 'nail']) c(cat)
  left join daily_sales(p_from, p_to) s on s.category = c.cat and s.by_staff = (p_staff_id is not null) and (p_staff_id is null or s.staff_id = p_staff_id)
  where p_category is null or c.cat in ('service', p_category)
  group by c.cat order by array_position(array['service', 'barbershop', 'nail'], c.cat);
end $$;

create function kpi_utilization(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (resource_id uuid, name text, type staff_category, sold_minutes numeric, planned_minutes numeric, available_minutes numeric,
               pct numeric, pct_planned numeric, n_actual int, planned_vs_actual_avg numeric)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare avail numeric := open_minutes(p_from, p_to);
begin
  perform require_role('manager');
  return query
  select x.id, x.name, x.type, coalesce(sum(m.sold_minutes), 0), coalesce(sum(m.planned_minutes), 0), avail,
         case when avail > 0 then coalesce(sum(m.sold_minutes), 0) * 100 / avail end,
         case when avail > 0 then coalesce(sum(m.planned_minutes), 0) * 100 / avail end,
         coalesce(sum(m.n_actual), 0)::int,
         sum(m.actual_minus_planned) / nullif(sum(m.n_actual), 0)
  from resources x
  left join daily_resource_minutes(p_from, p_to) m on m.resource_id = x.id and (p_staff_id is null or m.staff_id = p_staff_id)
  where x.active and (p_category is null or x.type::text = p_category)
  group by x.id order by x.type, x.sort;
end $$;

-- Interval layanan untuk peta panas: nyata bila ada, selain itu rencana (mulai + durasi).
create function appt_interval(a appointments, p_now timestamptz, out s timestamptz, out e timestamptz) language sql stable set search_path = public as $$
  select coalesce(a.service_started_at, a.start_at),
         coalesce(a.service_started_at, a.start_at) + make_interval(mins => appt_minutes(a, p_now)::int)
$$;

-- 4.6: (hari-minggu 1=Sen..7=Min, jam) → total menit terjual di jam itu ÷ jumlah tanggal hari-minggu tsb dalam periode.
create function kpi_heatmap(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (weekday int, hour int, minutes_avg numeric, closed boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_role('manager');
  return query
  with iv as materialized (
    select (appt_interval(a, now())).* from appointments a join resources x on x.id = a.resource_id
    where a.status in ('in_service', 'completed', 'paid')
      and a.start_at >= jkt(p_from, '00:00') and a.start_at < jkt(p_to + 1, '00:00')
      and (p_category is null or x.type::text = p_category) and (p_staff_id is null or a.staff_id = p_staff_id)
  ), pieces as (
    select extract(isodow from h at time zone 'Asia/Jakarta')::int as wd, extract(hour from h at time zone 'Asia/Jakarta')::int as hr,
           extract(epoch from least(iv.e, h + interval '1 hour') - greatest(iv.s, h)) / 60 as mins
    from iv cross join lateral generate_series(date_trunc('hour', iv.s), iv.e - interval '1 microsecond', interval '1 hour') h
    where iv.e > iv.s
  ), cells as (
    select wd, hr, sum(mins) as mins from pieces group by 1, 2
  ), weeks as (
    select extract(isodow from g.d)::int as wd, count(*) as n from generate_series(p_from, p_to, interval '1 day') g(d) group by 1
  ), grid as (
    select oh.weekday as dow, case when oh.weekday = 0 then 7 else oh.weekday end as wd, oh.closed,
           extract(hour from oh.open_time)::int as h0, ceil(extract(epoch from oh.close_time) / 3600)::int as h1
    from opening_hours oh
  ), span as (select min(h0) as h0, max(h1) as h1 from grid where not closed)
  select g.wd, hh, coalesce(c.mins, 0) / coalesce(w.n, 1), g.closed or hh < g.h0 or hh >= g.h1 or w.n is null
  from grid g cross join span cross join lateral generate_series(span.h0, span.h1 - 1) hh
  left join cells c on c.wd = g.wd and c.hr = hh
  left join weeks w on w.wd = g.wd
  order by 1, 2;
end $$;

-- 4.7: selisih durasi per layanan (appointment satu layanan dengan waktu nyata), hanya n ≥ 5.
-- ponytail: appointment berisi >1 layanan dilewati — durasi nyatanya tidak bisa dibagi per layanan.
create function kpi_duration_variance(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (service_id uuid, name text, planned_min int, actual_avg numeric, diff_avg numeric, n int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_role('manager');
  return query
  with one as (
    select a.id, min(s.id::text)::uuid as sid, a.duration_min, extract(epoch from a.service_ended_at - a.service_started_at) / 60 as actual
    from appointments a join appointment_services aps on aps.appointment_id = a.id join services s on s.id = aps.service_id
    where a.service_started_at is not null and a.service_ended_at is not null and a.status in ('completed', 'paid')
      and a.start_at >= jkt(p_from, '00:00') and a.start_at < jkt(p_to + 1, '00:00')
      and (p_category is null or s.category::text = p_category) and (p_staff_id is null or a.staff_id = p_staff_id)
    group by a.id having count(*) = 1
  )
  select s.id, s.name, s.duration_min, avg(one.actual), avg(one.actual - one.duration_min), count(*)::int
  from one join services s on s.id = one.sid
  group by s.id having count(*) >= 5
  order by abs(avg(one.actual - one.duration_min)) desc;
end $$;

create function kpi_retail(p_from date, p_to date, p_staff_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p jsonb := kpi_period(p_from, p_to, null, p_staff_id); st settings;
begin
  perform require_role('manager');
  select * into st from settings;
  return jsonb_build_object(
    'retail_revenue', p -> 'rev_retail', 'service_revenue', p -> 'rev_service', 'ratio', p -> 'retail_ratio',
    'min', st.retail_ratio_min, 'max', st.retail_ratio_max,
    'top', coalesce((select jsonb_agg(x order by x.revenue desc, x.name) from (
      select ti.name, count(*)::int as qty, sum(ti.net_amount)::bigint as revenue
      from transaction_items ti join transactions t on t.id = ti.transaction_id
      where t.voided_at is null and ti.category = 'retail' and t.created_at >= jkt(p_from, '00:00') and t.created_at < jkt(p_to + 1, '00:00')
        and (p_staff_id is null or ti.staff_id = p_staff_id)
      group by ti.name order by revenue desc, ti.name limit 5) x), '[]'));
end $$;

create function kpi_revenue_mix(p_from date, p_to date, p_staff_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  return (
    with s as (select * from daily_sales(p_from, p_to) where by_staff = (p_staff_id is not null) and (p_staff_id is null or staff_id = p_staff_id)
                 and category in ('barbershop', 'nail', 'retail')),
    tot as (select sum(revenue_net) as t from s)
    select jsonb_build_object(
      'mix', coalesce((select jsonb_agg(jsonb_build_object('category', c, 'revenue', coalesce(r, 0), 'share', case when tot.t > 0 then coalesce(r, 0) * 100.0 / tot.t end)
                                        order by array_position(array['barbershop', 'nail', 'retail'], c))
                       from unnest(array['barbershop', 'nail', 'retail']) c
                       left join lateral (select sum(revenue_net) as r from s where s.category = c) x on true), '[]'),
      'weekly', coalesce((select jsonb_agg(w order by w.week) from (
        select date_trunc('week', day)::date as week,
               coalesce(sum(revenue_net) filter (where category = 'barbershop'), 0)::bigint as barbershop,
               coalesce(sum(revenue_net) filter (where category = 'nail'), 0)::bigint as nail,
               coalesce(sum(revenue_net) filter (where category = 'retail'), 0)::bigint as retail
        from s group by 1) w), '[]'))
    from tot);
end $$;

-- 4.8 Pelanggan (walk-in dikecualikan).
create function kpi_customers(p_from date, p_to date, p_today date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare st settings; today date := coalesce(p_today, jkt_today()); r jsonb;
begin
  perform require_role('manager');
  select * into st from settings;
  with v as (
    select distinct t.customer_id as c, (t.created_at at time zone 'Asia/Jakarta')::date as d
    from transactions t where t.voided_at is null and t.customer_id is not null
  ), inp as (select * from v where d between p_from and p_to),
  firsts as (select c, min(d) as first_d from v group by c),
  elig as (select distinct c from inp where d <= today - st.return_window_days),
  back as (select distinct i.c from inp i where i.d <= today - st.return_window_days
             and exists (select 1 from v w where w.c = i.c and w.d > i.d and w.d - i.d <= st.return_window_days)),
  fu as (select distinct f.customer_id as c from followup_events f
         where (f.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
  fu_ok as (select distinct f.customer_id as c from followup_events f
            where (f.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
              and exists (select 1 from transactions t where t.customer_id = f.customer_id and t.voided_at is null
                            and t.created_at > f.created_at and t.created_at <= f.created_at + make_interval(days => st.followup_window_days)))
  select jsonb_build_object(
    'new_customers', (select count(*) from firsts where first_d between p_from and p_to),
    'returning', (select count(distinct i.c) from inp i join firsts f on f.c = i.c where f.first_d < p_from),
    'return_eligible', (select count(*) from elig), 'return_back', (select count(*) from back),
    'return_rate', (select case when count(*) > 0 then (select count(*) from back) * 100.0 / count(*) end from elig),
    'churn_count', (select count(*) from customer_stats where is_churn),
    'followup_sent', (select count(*) from fu), 'followup_converted', (select count(*) from fu_ok),
    'followup_rate', (select case when count(*) > 0 then (select count(*) from fu_ok) * 100.0 / count(*) end from fu),
    'window_days', st.return_window_days, 'followup_window_days', st.followup_window_days) into r;
  return r;
end $$;

-- 4.9 Booking online.
create function kpi_online(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a0 timestamptz := jkt(p_from, '00:00'); a1 timestamptz := jkt(p_to + 1, '00:00'); r jsonb;
begin
  perform require_role('manager');
  select jsonb_build_object(
    'landing', (select count(*) from funnel_events where step = 'landing' and created_at >= a0 and created_at < a1),
    'booking_open', (select count(*) from funnel_events where step = 'booking_open' and created_at >= a0 and created_at < a1),
    'booked', (select count(*) from funnel_events where step = 'booked' and created_at >= a0 and created_at < a1),
    'online_appts', (select count(*) from appointments where source = 'online' and status <> 'cancelled' and start_at >= a0 and start_at < a1),
    'all_appts', (select count(*) from appointments where status <> 'cancelled' and start_at >= a0 and start_at < a1),
    'online_created', (select count(*) from appointments where source = 'online' and created_at >= a0 and created_at < a1),
    'online_cancelled', (select count(*) from appointments where source = 'online' and status = 'cancelled' and created_at >= a0 and created_at < a1),
    'no_show', (select count(*) from appointments where status = 'no_show' and start_at >= a0 and start_at < a1),
    'showed', (select count(*) from appointments where status in ('completed', 'paid') and start_at >= a0 and start_at < a1)) into r;
  return r || jsonb_build_object(
    'share_online', case when (r ->> 'all_appts')::int > 0 then (r ->> 'online_appts')::numeric * 100 / (r ->> 'all_appts')::int end,
    'cancel_rate', case when (r ->> 'online_created')::int > 0 then (r ->> 'online_cancelled')::numeric * 100 / (r ->> 'online_created')::int end,
    'no_show_rate', case when (r ->> 'no_show')::int + (r ->> 'showed')::int > 0
                         then (r ->> 'no_show')::numeric * 100 / ((r ->> 'no_show')::int + (r ->> 'showed')::int) end);
end $$;

-- Persen 1 desimal gaya Indonesia (22,7).
create function pct1(v numeric) returns text language sql immutable as $$ select replace(to_char(round(v, 1), 'FM9990.0'), '.', ',') $$;

-- 4.11 Insight berbasis aturan: maks 3, urut prioritas. Cermin insights() di kpi.ts.
create function kpi_insights(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (priority int, code text, message text, href text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare st settings; p jsonb; up_rate numeric; cat text; target bigint; aovv numeric; up_name text;
        low_name text; low_pct numeric; busy_wd int; busy_hr int; o jsonb; dv_name text; dv_diff numeric; out_rows jsonb := '[]';
        days text[] := array['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];
begin
  perform require_role('manager');
  select * into st from settings;
  p := kpi_period(p_from, p_to, p_category, p_staff_id);
  foreach cat in array array['barbershop', 'nail'] loop
    continue when p_category is not null and p_category <> cat;
    target := case cat when 'barbershop' then st.aov_target_barbershop else st.aov_target_nail end;
    aovv := (p ->> ('aov_' || cat))::numeric;
    if aovv is not null and target > 0 and (target - aovv) * 100 / target > st.insight_aov_gap_pct then
      select d.upsell_rate into up_rate from kpi_aov_drivers(p_from, p_to, cat, p_staff_id) d where d.category = cat;
      up_name := null;
      select ti.name into up_name from transaction_items ti join transactions t on t.id = ti.transaction_id
      where ti.from_upsell and t.voided_at is null and ti.category::text = cat and t.created_at >= jkt(p_from, '00:00') and t.created_at < jkt(p_to + 1, '00:00')
      group by ti.name order by count(*) desc, ti.name limit 1;
      if up_name is null then
        select u.name into up_name from services s join services u on u.id = s.upsell_service_id where s.category::text = cat and s.active order by s.sort limit 1;
      end if;
      out_rows := out_rows || jsonb_build_object('priority', 1, 'code', 'aov_' || cat,
        'message', format('AOV %s %s%% di bawah target. Tingkat upsell %s %s%% — tawarkan %s.',
          case cat when 'barbershop' then 'Barbershop' else 'Nail' end, pct1((target - aovv) * 100 / target),
          case cat when 'barbershop' then 'Barbershop' else 'Nail' end, pct1(coalesce(up_rate, 0)),
          coalesce(up_name, 'layanan tambahan')),
        'href', '#aov');
    end if;
  end loop;
  select u.name, u.pct into low_name, low_pct from kpi_utilization(p_from, p_to, p_category, p_staff_id) u
  where u.pct is not null and u.pct < st.insight_low_util_pct order by u.pct, u.name limit 1;
  if found then
    select h.weekday, h.hour into busy_wd, busy_hr from kpi_heatmap(p_from, p_to, p_category, p_staff_id) h
    where not h.closed order by h.minutes_avg desc, h.weekday, h.hour limit 1;
    out_rows := out_rows || jsonb_build_object('priority', 2, 'code', 'low_util',
      'message', format('%s terpakai %s%% — jam paling ramai: %s %s:00. Pertimbangkan jadwal staf / promo jam sepi.',
        low_name, pct1(low_pct), days[busy_wd], lpad(busy_hr::text, 2, '0')),
      'href', '#utilisasi');
  end if;
  if p_category is null and (p ->> 'retail_ratio') is not null
     and ((p ->> 'retail_ratio')::numeric < st.retail_ratio_min or (p ->> 'retail_ratio')::numeric > st.retail_ratio_max) then
    out_rows := out_rows || jsonb_build_object('priority', 3, 'code', 'retail_ratio',
      'message', format('Rasio ritel %s%%, %s target %s–%s%%.', pct1((p ->> 'retail_ratio')::numeric),
        case when (p ->> 'retail_ratio')::numeric < st.retail_ratio_min then 'di bawah' else 'di atas' end, st.retail_ratio_min, st.retail_ratio_max),
      'href', '#ritel');
  end if;
  o := kpi_online(p_from, p_to);
  if (o ->> 'no_show_rate')::numeric > 10 then
    out_rows := out_rows || jsonb_build_object('priority', 4, 'code', 'no_show',
      'message', format('No-show %s%% — aktifkan pengingat H-1.', pct1((o ->> 'no_show_rate')::numeric)), 'href', '#online');
  end if;
  select d.name, d.diff_avg into dv_name, dv_diff from kpi_duration_variance(p_from, p_to, p_category, p_staff_id) d
  where d.diff_avg > 10 order by d.diff_avg desc limit 1;
  if found then
    out_rows := out_rows || jsonb_build_object('priority', 5, 'code', 'overrun',
      'message', format('%s rata-rata molor %s menit — perbarui durasi di Pengaturan.', dv_name, round(dv_diff)), 'href', '#durasi');
  end if;
  return query select (x ->> 'priority')::int, x ->> 'code', x ->> 'message', x ->> 'href'
  from jsonb_array_elements(out_rows) x order by (x ->> 'priority')::int, x ->> 'code' limit 3;
end $$;

-- Semua bagian Analitik dalam satu panggilan (satu round-trip). Isinya tetap fungsi kpi_* yang sama (P1).
create function kpi_dashboard(p_from date, p_to date, p_category text default null, p_staff_id uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  return jsonb_build_object(
    'summary', kpi_summary(p_from, p_to, p_category, p_staff_id),
    'daily', (select coalesce(jsonb_agg(x order by x.day), '[]') from kpi_aov_daily(p_from, p_to, p_category, p_staff_id) x),
    'drivers', (select coalesce(jsonb_agg(x), '[]') from kpi_aov_drivers(p_from, p_to, p_category, p_staff_id) x),
    'util', (select coalesce(jsonb_agg(x), '[]') from kpi_utilization(p_from, p_to, p_category, p_staff_id) x),
    'heat', (select coalesce(jsonb_agg(x), '[]') from kpi_heatmap(p_from, p_to, p_category, p_staff_id) x),
    'duration', (select coalesce(jsonb_agg(x), '[]') from kpi_duration_variance(p_from, p_to, p_category, p_staff_id) x),
    'retail', kpi_retail(p_from, p_to, p_staff_id),
    'mix', kpi_revenue_mix(p_from, p_to, p_staff_id),
    'customers', kpi_customers(p_from, p_to),
    'online', kpi_online(p_from, p_to),
    'insights', (select coalesce(jsonb_agg(x order by x.priority), '[]') from kpi_insights(p_from, p_to, p_category, p_staff_id) x));
end $$;

-- =====================================================================================================
-- 3. SOP
-- =====================================================================================================
create function sop_status(p_done int, p_total int, p_approved boolean, p_closed boolean) returns text language sql immutable as $$
  select case when p_approved then 'ok' when p_closed and p_done = 0 then 'closed' when p_total > 0 and p_done >= p_total then 'done'
              when p_done > 0 then 'part' else 'empty' end
$$;

create function sop_day(p_date date, p_shift int default 1) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare total int := (select count(*) * 3 from sop_tool_groups where active); ap record; done int; r jsonb;
begin
  perform require_role('manager', 'staff');
  if auth_role() = 'staff' and p_date <> jkt_today() then raise exception 'Kapster hanya bisa membuka checklist hari ini'; end if;
  select a.created_at, p.full_name into ap from sop_approvals a left join profiles p on p.id = a.approved_by where a.date = p_date and a.shift = p_shift;
  select count(*) into done from sop_logs l join sop_tool_groups g on g.id = l.group_id and g.active
  where l.date = p_date and l.shift = p_shift and l.undone_at is null;
  select jsonb_build_object('date', p_date, 'shift', p_shift, 'done', done, 'total', total,
    'closed', not exists (select 1 from day_window(p_date)),
    'status', sop_status(done, total, ap.created_at is not null, not exists (select 1 from day_window(p_date))),
    'approval', case when ap.created_at is not null then jsonb_build_object('by', ap.full_name, 'at', ap.created_at) end,
    'is_today', p_date = jkt_today(),
    'groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'description', g.description,
       'stages', (select coalesce(jsonb_object_agg(l.stage::text, jsonb_build_object('log_id', l.id, 'by', pr.full_name, 'by_id', l.done_by,
                    'on_behalf', s.name, 'at', l.created_at, 'note', l.note, 'photo', l.photo_path)), '{}')
                  from sop_logs l left join profiles pr on pr.id = l.done_by left join staff s on s.id = l.on_behalf_staff_id
                  where l.date = p_date and l.shift = p_shift and l.group_id = g.id and l.undone_at is null)) order by g.sort)
       from sop_tool_groups g where g.active), '[]')) into r;
  return r;
end $$;

drop function record_sop_stage(uuid, sop_stage);
drop function undo_sop_stage(uuid, sop_stage, date);
drop function approve_sop_day(date);

-- Selalu hari ini (Asia/Jakarta). Urutan wajib cuci → rendam → autoclave. Manajer boleh mengisi atas nama staf.
create function record_sop_stage(p_group_id uuid, p_stage sop_stage, p_shift int default 1, p_note text default null,
                                 p_photo_path text default null, p_on_behalf_staff uuid default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare d date := jkt_today(); stages sop_stage[] := enum_range(null::sop_stage); pos int; st settings; lid uuid;
begin
  perform require_role('manager', 'staff');
  select * into st from settings;
  if p_shift < 1 or p_shift > st.sop_shifts then raise exception 'Shift tidak valid'; end if;
  if not exists (select 1 from sop_tool_groups where id = p_group_id and active) then raise exception 'Kelompok alat tidak ditemukan'; end if;
  if exists (select 1 from sop_approvals where date = d and shift = p_shift) then raise exception 'Checklist tanggal ini sudah diotorisasi'; end if;
  if p_on_behalf_staff is not null and auth_role() <> 'manager' then raise exception 'Hanya manajer yang bisa mengisi atas nama staf'; end if;
  pos := array_position(stages, p_stage);
  if pos > 1 and not exists (select 1 from sop_logs where date = d and shift = p_shift and group_id = p_group_id and stage = stages[pos - 1] and undone_at is null) then
    raise exception 'Selesaikan tahap % dulu', case stages[pos - 1] when 'wash' then 'Cuci' when 'soak' then 'Rendam' else 'Autoclave' end;
  end if;
  if p_stage = 'autoclave' and st.sop_require_photo_autoclave and nullif(p_photo_path, '') is null then
    raise exception 'Foto indikator autoclave wajib';
  end if;
  insert into sop_logs (date, shift, group_id, stage, done_by, note, photo_path, on_behalf_staff_id)
  values (d, p_shift, p_group_id, p_stage, auth.uid(), coalesce(trim(p_note), ''), nullif(p_photo_path, ''), p_on_behalf_staff)
  returning id into lid;
  update notifications set read_at = now() where kind = 'sop_reminder' and read_at is null and payload ->> 'date' = d::text;
  return lid;
exception when unique_violation then
  raise exception 'Tahap ini sudah dicatat';
end $$;

-- Pembatalan (bukan hapus): pengisi yang sama atau manajer, sebelum otorisasi & tahap sesudahnya tidak aktif.
create function undo_sop_stage(p_log_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare l sop_logs;
begin
  perform require_role('manager', 'staff');
  select * into l from sop_logs where id = p_log_id and undone_at is null for update;
  if not found then raise exception 'Log tidak ditemukan'; end if;
  if auth_role() <> 'manager' and (l.done_by is distinct from auth.uid() or l.date <> jkt_today()) then
    raise exception 'Hanya pengisi atau manajer yang bisa membatalkan';
  end if;
  if exists (select 1 from sop_approvals where date = l.date and shift = l.shift) then raise exception 'Checklist tanggal ini sudah diotorisasi'; end if;
  if exists (select 1 from sop_logs where date = l.date and shift = l.shift and group_id = l.group_id and stage > l.stage and undone_at is null) then
    raise exception 'Batalkan tahap berikutnya dulu';
  end if;
  update sop_logs set undone_at = now(), undone_by = auth.uid() where id = p_log_id;
end $$;

create function approve_sop_day(p_date date, p_shift int default 1) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if (select count(*) from sop_logs l join sop_tool_groups g on g.id = l.group_id and g.active
      where l.date = p_date and l.shift = p_shift and l.undone_at is null)
     < (select count(*) * 3 from sop_tool_groups where active) then
    raise exception 'Checklist belum lengkap';
  end if;
  insert into sop_approvals (date, shift, approved_by) values (p_date, p_shift, auth.uid());
exception when unique_violation then
  raise exception 'Shift ini sudah diotorisasi';
end $$;

-- Riwayat per tanggal/shift. Kapster: maks 14 hari terakhir.
create function sop_history(p_from date, p_to date)
returns table (date date, shift int, status text, done int, total int)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare tot int := (select count(*) * 3 from sop_tool_groups where active); n int := (select sop_shifts from settings);
begin
  perform require_role('manager', 'staff');
  if auth_role() = 'staff' then p_from := greatest(p_from, jkt_today() - 13); p_to := least(p_to, jkt_today()); end if;
  return query
  select g.d::date, sh, sop_status(c.done, tot, a.id is not null, not exists (select 1 from day_window(g.d::date))), c.done, tot
  from generate_series(p_from, p_to, interval '1 day') g(d) cross join generate_series(1, n) sh
  cross join lateral (select count(*)::int as done from sop_logs l join sop_tool_groups x on x.id = l.group_id and x.active
                      where l.date = g.d::date and l.shift = sh and l.undone_at is null) c
  left join sop_approvals a on a.date = g.d::date and a.shift = sh
  order by 1 desc, 2;
end $$;

-- Laporan kepatuhan: per hari/shift + pengisi + penyetuju, % hari patuh (ok ÷ hari operasional), log perawatan.
create function sop_compliance_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  return (
    with h as (select * from sop_history(p_from, p_to))
    select jsonb_build_object(
      'from', p_from, 'to', p_to,
      'operational', (select count(*) from h where status <> 'closed'),
      'ok', (select count(*) from h where status = 'ok'),
      'compliance_pct', (select case when count(*) filter (where status <> 'closed') > 0
                                     then count(*) filter (where status = 'ok') * 100.0 / count(*) filter (where status <> 'closed') end from h),
      'days', coalesce((select jsonb_agg(jsonb_build_object('date', h.date, 'shift', h.shift, 'status', h.status, 'done', h.done, 'total', h.total,
          'approved_by', (select p.full_name from sop_approvals a left join profiles p on p.id = a.approved_by where a.date = h.date and a.shift = h.shift),
          'approved_at', (select a.created_at from sop_approvals a where a.date = h.date and a.shift = h.shift),
          'logs', (select coalesce(jsonb_agg(jsonb_build_object('group', g.name, 'stage', l.stage, 'by', pr.full_name, 'on_behalf', s.name,
                     'at', l.created_at, 'note', l.note, 'photo', l.photo_path is not null) order by g.sort, l.stage), '[]')
                   from sop_logs l join sop_tool_groups g on g.id = l.group_id left join profiles pr on pr.id = l.done_by
                   left join staff s on s.id = l.on_behalf_staff_id
                   where l.date = h.date and l.shift = h.shift and l.undone_at is null)) order by h.date, h.shift) from h), '[]'),
      'maintenance', coalesce((select jsonb_agg(jsonb_build_object('task', t.name, 'at', m.created_at, 'by', pr.full_name, 'note', m.note,
          'vendor', m.vendor, 'cost', m.cost) order by m.created_at)
        from maintenance_logs m join maintenance_tasks t on t.id = m.task_id left join profiles pr on pr.id = m.done_by
        where m.created_at >= jkt(p_from, '00:00') and m.created_at < jkt(p_to + 1, '00:00')), '[]')));
end $$;

-- Konfigurasi SOP untuk kapster (tabel settings hanya manajer).
create function sop_config() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('shifts', sop_shifts, 'names', sop_shift_names, 'require_photo', sop_require_photo_autoclave) from settings
$$;

-- =====================================================================================================
-- 3. Perawatan
-- =====================================================================================================
create function maintenance_state(p_days_left int) returns text language sql immutable as $$
  select case when p_days_left < 0 then 'overdue' when p_days_left = 0 then 'due' when p_days_left <= 3 then 'soon' else 'ok' end
$$;

create function maintenance_status(p_today date default null)
returns table (task_id uuid, name text, interval_days int, procedure text, assignee_staff_id uuid, assignee text, active boolean,
               last_done_at timestamptz, next_due date, days_left int, status text, history jsonb)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare today date := coalesce(p_today, jkt_today()); mgr boolean;
begin
  perform require_role('manager', 'staff');
  mgr := auth_role() = 'manager';
  return query
  with last as (
    select t.id, (select max(m.created_at) from maintenance_logs m where m.task_id = t.id) as at from maintenance_tasks t
  )
  select t.id, t.name, t.interval_days, t.procedure, t.assignee_staff_id, s.name, t.active, last.at,
         (coalesce((last.at at time zone 'Asia/Jakarta')::date, (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days),
         (coalesce((last.at at time zone 'Asia/Jakarta')::date, (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days - today),
         maintenance_state(coalesce((last.at at time zone 'Asia/Jakarta')::date, (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days - today),
         coalesce((select jsonb_agg(x) from (
           select jsonb_build_object('id', m.id, 'at', m.created_at, 'by', p.full_name, 'note', m.note, 'vendor', m.vendor, 'photo', m.photo_path,
                                     'cost', case when mgr then m.cost end) as x
           from maintenance_logs m left join profiles p on p.id = m.done_by where m.task_id = t.id order by m.created_at desc limit 3) h), '[]')
  from maintenance_tasks t join last on last.id = t.id left join staff s on s.id = t.assignee_staff_id
  where t.active or mgr
  order by 10, t.name;
end $$;

create function maintenance_mark_done(p_task_id uuid, p_note text default null, p_photo_path text default null,
                                      p_cost bigint default null, p_vendor text default null) returns uuid
language plpgsql security definer set search_path = public as $$
declare lid uuid;
begin
  perform require_role('manager', 'staff');
  if p_cost is not null and auth_role() <> 'manager' then raise exception 'Biaya hanya diisi manajer'; end if;
  if not exists (select 1 from maintenance_tasks where id = p_task_id and active) then raise exception 'Tugas tidak ditemukan'; end if;
  insert into maintenance_logs (task_id, done_by, note, photo_path, cost, vendor)
  values (p_task_id, auth.uid(), coalesce(trim(p_note), ''), nullif(p_photo_path, ''), p_cost, nullif(trim(coalesce(p_vendor, '')), ''))
  returning id into lid;
  update notifications set read_at = now() where kind in ('maintenance_due', 'maintenance_overdue') and read_at is null
    and payload ->> 'task_id' = p_task_id::text;
  return lid;
end $$;

-- =====================================================================================================
-- Pengingat (pg_cron). Parameter waktu untuk simulasi di tes.
-- =====================================================================================================
-- Pada/sesudah sop_reminder_time, bila checklist hari ini belum ada log: notif ke kapster bertugas (punya booking,
-- tidak izin seharian) & manajer. Sekali per hari.
create function sop_reminders(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = public as $$
declare d date := (p_now at time zone 'Asia/Jakarta')::date; st settings; n int := 0;
begin
  select * into st from settings;
  if (p_now at time zone 'Asia/Jakarta')::time < st.sop_reminder_time then return 0; end if;
  if not exists (select 1 from day_window(d)) then return 0; end if;
  if exists (select 1 from sop_logs where date = d and undone_at is null) then return 0; end if;
  if exists (select 1 from notifications where kind = 'sop_reminder' and payload ->> 'date' = d::text) then return 0; end if;
  insert into notifications (target_role, target_user, kind, payload)
  select 'staff', p.id, 'sop_reminder', jsonb_build_object('date', d)
  from profiles p
  where p.role = 'staff' and p.active and p.staff_id is not null
    and exists (select 1 from appointments a where a.staff_id = p.staff_id and a.status not in ('cancelled', 'pending_review')
                  and a.start_at >= jkt(d, '00:00') and a.start_at < jkt(d + 1, '00:00'))
    and not exists (select 1 from staff_time_off o where o.staff_id = p.staff_id and o.status = 'approved'
                      and o.start_at <= jkt(d, '00:00') and o.end_at >= jkt(d + 1, '00:00'));
  get diagnostics n = row_count;
  perform notify('manager', 'sop_reminder', jsonb_build_object('date', d));
  return n + 1;
end $$;

-- Harian: H-1 & jatuh tempo → manajer; terlambat → manajer (sekali per tugas per hari).
create function maintenance_reminders(p_today date default null) returns int
language plpgsql security definer set search_path = public as $$
declare today date := coalesce(p_today, jkt_today()); n int;
begin
  insert into notifications (target_role, kind, payload)
  select 'manager', case when m.days_left < 0 then 'maintenance_overdue' else 'maintenance_due' end,
         jsonb_build_object('task_id', m.task_id, 'name', m.name, 'days_left', m.days_left, 'date', today)
  from maintenance_status_internal(today) m
  where m.days_left <= 1
    and not exists (select 1 from notifications x where x.kind in ('maintenance_due', 'maintenance_overdue')
                      and x.payload ->> 'task_id' = m.task_id::text and x.payload ->> 'date' = today::text);
  get diagnostics n = row_count;
  return n;
end $$;
create function maintenance_status_internal(p_today date) returns table (task_id uuid, name text, days_left int)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, coalesce(((select max(m.created_at) from maintenance_logs m where m.task_id = t.id) at time zone 'Asia/Jakarta')::date,
                                (t.created_at at time zone 'Asia/Jakarta')::date) + t.interval_days - p_today
  from maintenance_tasks t where t.active
$$;
select cron.schedule('gb-sop-reminder', '*/15 * * * *', $$select public.sop_reminders()$$);
select cron.schedule('gb-maintenance-reminder', '0 1 * * *', $$select public.maintenance_reminders()$$);  -- 08:00 WIB

-- =====================================================================================================
-- Hak eksekusi
-- =====================================================================================================
revoke execute on function kpi_period(date, date, text, uuid), daily_sales(date, date), daily_resource_minutes(date, date),
  open_minutes(date, date), refresh_analytics(boolean), mark_analytics_dirty(), sop_reminders(timestamptz),
  maintenance_reminders(date), maintenance_status_internal(date)
  from public, anon, authenticated;
revoke all on mv_daily_sales, mv_daily_resource_minutes from anon, authenticated;
revoke execute on function sales_rows(timestamptz, timestamptz), resource_rows(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function kpi_summary(date, date, text, uuid), kpi_aov_daily(date, date, text, uuid), kpi_aov_drivers(date, date, text, uuid),
  kpi_utilization(date, date, text, uuid), kpi_heatmap(date, date, text, uuid), kpi_duration_variance(date, date, text, uuid),
  kpi_retail(date, date, uuid), kpi_revenue_mix(date, date, uuid), kpi_customers(date, date, date), kpi_online(date, date),
  kpi_insights(date, date, text, uuid), kpi_dashboard(date, date, text, uuid), sop_day(date, int), record_sop_stage(uuid, sop_stage, int, text, text, uuid),
  undo_sop_stage(uuid), approve_sop_day(date, int), sop_history(date, date), sop_compliance_report(date, date),
  maintenance_status(date), maintenance_mark_done(uuid, text, text, bigint, text), mark_no_show(uuid), sop_config()
  from public, anon;
