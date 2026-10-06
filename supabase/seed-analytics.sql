-- Riwayat 12 bulan untuk demo Analitik & tes kinerja (±10.000 transaksi). OPSIONAL — jalankan sesudah db reset:
--   npm run seed:analytics
-- Deterministik (setseed). Trigger Web Push dimatikan selama seed.
-- ponytail: stok bahan tidak ikut berkurang — data ini hanya untuk Analitik, bukan inventaris.
do $$
declare
  d date; n int; k int; r float; tx uuid; cid uuid; t0 timestamptz; disc bigint; sub bigint; base bigint;
  barber uuid[] := array(select id from resources where type = 'barbershop' and active order by sort);
  nailr uuid[] := array(select id from resources where type = 'nail' and active order by sort);
  bstaff uuid[] := array(select id from staff where category = 'barbershop' and active order by sort);
  nstaff uuid[] := array(select id from staff where category = 'nail' and active order by sort);
  bsvc record; nsvc record; rsvc record; upsvc record; custs uuid[] := array(select id from customers order by name);
  w record; mins int; aid uuid; lines jsonb; l jsonb; share bigint; alloc bigint; bundle boolean; st_id uuid; res uuid; up boolean;
begin
  alter table appointments disable trigger appointments_notify_push;  -- tanpa Web Push untuk data historis
  perform set_config('app.via_checkout', 'on', true);                 -- izinkan appointment berstatus paid
  perform setseed(0.42);
  insert into customers (name, whatsapp)
  select 'Pelanggan ' || i, '62819' || lpad(i::text, 7, '0') from generate_series(1, 600) i
  on conflict do nothing;
  custs := array(select id from customers order by name);
  select id, name, price, duration_min into upsvc from services where name = 'Hair Spa';
  for d in select g::date from generate_series(jkt_today() - 365, jkt_today() - 1, interval '1 day') g loop
    select * into w from day_window(d);
    continue when not found;
    n := 18 + floor(random() * 16)::int + case when extract(isodow from d) in (5, 6, 7) then 8 else 0 end;
    for k in 1..n loop
      r := random();
      t0 := jkt(d, make_time(0, 0, 0)) + make_interval(mins => w.open_m + floor(random() * greatest(60, w.close_m - w.open_m - 90))::int);
      cid := case when random() < 0.7 then custs[1 + floor(random() * array_length(custs, 1))::int] end;
      bundle := r >= 0.75 and r < 0.9;
      up := false;
      lines := '[]';
      if r < 0.45 or bundle then
        select id, name, price, duration_min into bsvc from services where category = 'barbershop' and active order by random() limit 1;
        lines := lines || jsonb_build_array(jsonb_build_object('s', bsvc.id, 'n', bsvc.name, 'c', 'barbershop', 'p', bsvc.price, 'm', bsvc.duration_min, 'u', false));
        if bsvc.name <> 'Hair Spa' and random() < 0.15 then
          lines := lines || jsonb_build_array(jsonb_build_object('s', upsvc.id, 'n', upsvc.name, 'c', 'barbershop', 'p', upsvc.price, 'm', upsvc.duration_min, 'u', true));
        end if;
      end if;
      if (r >= 0.45 and r < 0.75) or bundle then
        select id, name, price, duration_min into nsvc from services where category = 'nail' and active order by random() limit 1;
        lines := lines || jsonb_build_array(jsonb_build_object('s', nsvc.id, 'n', nsvc.name, 'c', 'nail', 'p', nsvc.price, 'm', nsvc.duration_min, 'u', false));
      end if;
      if r >= 0.9 or random() < 0.18 then
        select id, name, price into rsvc from services where category = 'retail' and active order by random() limit 1;
        lines := lines || jsonb_build_array(jsonb_build_object('s', rsvc.id, 'n', rsvc.name, 'c', 'retail', 'p', rsvc.price, 'm', 0, 'u', false));
      end if;
      select sum((x ->> 'p')::bigint), coalesce(sum((x ->> 'p')::bigint) filter (where x ->> 'c' <> 'retail'), 0) into sub, base from jsonb_array_elements(lines) x;
      disc := case when bundle then round(base * 10 / 10000.0) * 100 else 0 end;
      insert into transactions (customer_id, subtotal, discount_amount, discount_label, total, paid_amount, payment_method, created_at)
      values (cid, sub, disc, case when disc > 0 then 'Diskon paket 10%' else '' end, sub - disc, sub - disc,
              (array['cash', 'qris'])[1 + floor(random() * 2)::int]::pay_method, t0 + interval '70 minutes')
      returning id into tx;
      alloc := 0;
      for l in select * from jsonb_array_elements(lines) loop
        share := 0;
        if disc > 0 and l ->> 'c' <> 'retail' then
          share := case when l ->> 'c' = 'nail' then disc - alloc else floor(disc::numeric * (l ->> 'p')::bigint / base)::bigint end;
          alloc := alloc + share;
        end if;
        aid := null; st_id := null;
        if l ->> 'c' <> 'retail' then
          st_id := case when l ->> 'c' = 'barbershop' then bstaff[1 + floor(random() * array_length(bstaff, 1))::int] else nstaff[1 + floor(random() * array_length(nstaff, 1))::int] end;
          res := case when l ->> 'c' = 'barbershop' then barber[1 + floor(random() * array_length(barber, 1))::int] else nailr[1 + floor(random() * array_length(nailr, 1))::int] end;
          mins := (l ->> 'm')::int;
          insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, end_at, status, source, created_at,
                                    arrived_at, service_started_at, service_ended_at)
          values (cid, res, st_id, t0, mins, t0 + make_interval(mins => mins), 'paid',
                  (case when random() < 0.22 then 'online' else 'admin' end)::appt_source, t0 - interval '2 days',
                  case when random() < 0.6 then t0 end, case when random() < 0.6 then t0 end, null)
          returning id into aid;
          update appointments set service_ended_at = service_started_at + make_interval(mins => greatest(10, mins + floor(random() * 15 - 4)::int))
          where id = aid and service_started_at is not null;
          insert into appointment_services (appointment_id, service_id) values (aid, (l ->> 's')::uuid);
        else
          st_id := case when random() < 0.5 then bstaff[1 + floor(random() * array_length(bstaff, 1))::int] end;
        end if;
        insert into transaction_items (transaction_id, service_id, appointment_id, staff_id, name, category, price, discount_share, net_amount, from_upsell)
        values (tx, (l ->> 's')::uuid, aid, st_id, l ->> 'n', (l ->> 'c')::service_category, (l ->> 'p')::bigint, share, (l ->> 'p')::bigint - share, (l ->> 'u')::boolean)
        returning id into aid;
        insert into transaction_item_costs (transaction_item_id, hpp) values (aid, coalesce(service_hpp((l ->> 's')::uuid), 0));
      end loop;
    end loop;
    -- booking online tidak datang / dibatalkan + corong
    insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, end_at, status, source, created_at)
    select custs[1 + floor(random() * 600)::int], barber[1], bstaff[1], jkt(d, '11:00'), 45, jkt(d, '11:45'),
           (case when random() < 0.5 then 'no_show' else 'cancelled' end)::appt_status, 'online', jkt(d, '08:00')
    from generate_series(1, floor(random() * 3)::int);
    insert into funnel_events (session_id, step, created_at)
    select 'seed-' || d || '-' || i, s.step, jkt(d, '09:00')
    from generate_series(1, 30 + floor(random() * 20)::int) i
    cross join lateral (values ('landing', 1.0), ('booking_open', 0.45), ('service', 0.35), ('time', 0.3), ('booked', 0.22)) s(step, p)
    where random() < s.p
    on conflict do nothing;
  end loop;
  -- follow-up bulanan ke ±40 pelanggan
  insert into followup_events (customer_id, created_at)
  select custs[1 + floor(random() * 600)::int], jkt(g::date, '10:00')
  from generate_series(jkt_today() - 360, jkt_today() - 5, interval '9 days') g cross join generate_series(1, 12);
  perform set_config('app.via_checkout', 'off', true);
  alter table appointments enable trigger appointments_notify_push;
  perform refresh_analytics(true);
  raise notice 'transaksi: %', (select count(*) from transactions);
end $$;
