-- Ukur campaign (rapat 26 & 28 Okt): dari mana pelanggan baru tahu D'Pras, dari mana pengunjung web datang,
-- dan satu laporan untuk angka rapat (potong Sen–Kam, upgrade paket, voucher per kode, pelanggan tercatat).

-- ---------- Sumber pelanggan baru ("Tahu dari mana?") ----------
alter table customers add column source text
  check (source in ('instagram', 'google_maps', 'whatsapp', 'teman', 'lewat', 'web', 'lainnya'));
comment on column customers.source is 'Tahu D''Pras dari mana (diisi saat pelanggan baru dicatat). Booking online = web.';

do $$
declare def text; old text;
begin
  select pg_get_functiondef('book_online'::regproc) into def;
  old := def;
  def := replace(def, $a$insert into customers (name, whatsapp, created_by) values (trim(p ->> 'name'), wa, null)$a$,
                      $a$insert into customers (name, whatsapp, created_by, source) values (trim(p ->> 'name'), wa, null, 'web')$a$);
  if def = old then raise exception 'Patch book_online tidak menemukan teks'; end if;
  execute def;
end $$;

-- ---------- Sumber pengunjung web (?src=ig / utm_source / referrer), dicatat di langkah landing ----------
alter table funnel_events add column source text check (source ~ '^[a-z_]{1,20}$');
drop function track_funnel(text, text);
create function track_funnel(p_session text, p_step text, p_source text default null) returns void
language sql security definer set search_path = public as $$
  insert into funnel_events (session_id, step, source)
  values (p_session, p_step, case when p_step = 'landing' and p_source ~ '^[a-z_]{1,20}$' then p_source end)
  on conflict do nothing
$$;
grant execute on function track_funnel(text, text, text) to anon, authenticated;

-- ---------- Laporan campaign (manajer) ----------
-- ponytail: "potong" & "upgrade" dikenali dari nama layanan barbershop; ganti ke kolom penanda bila menu sering berubah nama.
create function campaign_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform require_role('manager');
  if p_to < p_from or p_to - p_from > 366 then raise exception 'Periode tidak valid'; end if;
  with days as (
    select d::date as day, extract(isodow from d)::int as dow from generate_series(p_from, p_to, interval '1 day') d
  ), cuts as (
    select (t.created_at at time zone 'Asia/Jakarta')::date as day, s.name ilike '%groom%' as upgrade
    from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id
    where t.voided_at is null and s.category = 'barbershop'
      and (s.name ilike '%groom%' or s.name in ('Essential Cut', 'Potong Rambut', 'Kids Cut'))
      and (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  ), per_day as (
    select d.day, d.dow, count(c.day) as n from days d left join cuts c on c.day = d.day group by d.day, d.dow
  ), tx as (
    select date_trunc('week', (created_at at time zone 'Asia/Jakarta')::date)::date as week, customer_id
    from transactions where voided_at is null and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  ), landing as (
    select session_id, coalesce(source, 'tidak_diketahui') as source from funnel_events
    where step = 'landing' and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'cuts', (select jsonb_build_object(
        'senkam_days', count(*) filter (where dow <= 4), 'senkam_cuts', coalesce(sum(n) filter (where dow <= 4), 0),
        'weekend_days', count(*) filter (where dow >= 6), 'weekend_cuts', coalesce(sum(n) filter (where dow >= 6), 0),
        'total', coalesce(sum(n), 0), 'upgrade', (select count(*) from cuts where upgrade)) from per_day),
    'weekly', coalesce((select jsonb_agg(jsonb_build_object('week', week, 'tx', n, 'with_customer', wc) order by week)
        from (select week, count(*) as n, count(customer_id) as wc from tx group by week) w), '[]'),
    'vouchers', coalesce((select jsonb_agg(jsonb_build_object('code', v.code, 'quota', v.quota, 'used_total', voucher_uses(v.id),
          'tx', x.n, 'discount', x.disc) order by x.n desc, v.code)
        from vouchers v join (
          select voucher_id, count(*) as n, sum(discount_amount) as disc from transactions
          where voided_at is null and voucher_id is not null and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          group by voucher_id) x on x.voucher_id = v.id), '[]'),
    'new_customers', coalesce((select jsonb_agg(jsonb_build_object('source', src, 'n', n) order by n desc)
        from (select coalesce(source, 'tidak_tercatat') as src, count(*) as n from customers
              where deleted_at is null and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) c), '[]'),
    'web', coalesce((select jsonb_agg(jsonb_build_object('source', l.source, 'visits', l.n, 'booked', l.booked) order by l.n desc)
        from (select source, count(*) as n,
                     count(*) filter (where exists (select 1 from funnel_events f where f.session_id = landing.session_id and f.step = 'booked')) as booked
              from landing group by source) l), '[]')
  ) into r;
  return r;
end $$;
revoke execute on function campaign_report(date, date) from public, anon;
