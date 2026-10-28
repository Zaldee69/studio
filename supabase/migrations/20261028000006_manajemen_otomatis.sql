-- Otomatisasi manajemen: ajak potong lagi (WA), minta ulasan Google (WA), cek tengah minggu (Telegram owner),
-- rapor mingguan capster (WA). Dua yang pertama ke pelanggan → default MATI, dinyalakan dari Pengaturan.

-- Layanan yang dihitung sebagai "potong" (sama dengan laporan campaign).
create function is_cut_service(p_name text) returns boolean language sql immutable as $$
  select p_name ilike '%groom%' or p_name in ('Essential Cut', 'Potong Rambut', 'Kids Cut')
$$;

-- Kunjungan terakhir per pelanggan. customer_stats (view) hanya terbuka untuk kasir/manajer yang login,
-- sedangkan cron & server berjalan tanpa login → hitung langsung dari transaksi.
create function last_visits() returns table (customer_id uuid, last_at timestamptz)
language sql stable security definer set search_path = public as $$
  select t.customer_id, max(t.created_at) from transactions t join customers c on c.id = t.customer_id
  where t.voided_at is null and c.deleted_at is null group by t.customer_id
$$;
revoke execute on function last_visits() from public, anon, authenticated;

alter table settings
  add column auto_followup_on boolean not null default false,
  add column google_review_url text check (google_review_url is null or google_review_url ~ '^https://');

-- Kiriman otomatis ke pelanggan memakai jalur blast (template promo): ikut batas harian & tercatat di riwayat kirim.
alter table campaigns add column auto_kind text unique check (auto_kind in ('followup', 'review'));
insert into campaigns (name, message, archived, auto_kind) values
  ('Otomatis: ajak potong lagi', '(template follow-up di Pengaturan)', true, 'followup'),
  ('Otomatis: minta ulasan Google', '(teks bawaan)', true, 'review');

alter table outbound_messages drop constraint outbound_messages_template_check;
alter table outbound_messages add constraint outbound_messages_template_check
  check (template in ('booking_confirmed', 'booking_pending', 'reminder_h1', 'promo', 'otp', 'alert', 'test', 'staff_report'));
alter table outbound_messages add constraint outbound_staff_report_shape check (template <> 'staff_report' or (channel = 'whatsapp' and body is not null));

-- Kirim satu batch promo otomatis (dipakai ajak potong lagi & minta ulasan).
create function enqueue_auto_promo(p_kind text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare sid uuid; n int := jsonb_array_length(p_rows); shop text;
begin
  if n = 0 then return 0; end if;
  select shop_name into shop from settings;
  insert into campaign_sends (campaign_id, message, segment, recipient_count, created_by)
  select id, '(otomatis)', jsonb_build_object('auto', p_kind), n, null from campaigns where auto_kind = p_kind
  returning id into sid;
  insert into outbound_messages (channel, to_address, template, send_id, customer_id, body)
  select 'whatsapp', r ->> 'wa', 'promo', sid, (r ->> 'id')::uuid, (r ->> 'body') || E'\n\n— ' || shop
  from jsonb_array_elements(p_rows) r;
  return n;
end $$;

-- Ajak potong lagi: pelanggan yang minggu ini melewati batas "Perlu follow-up" (churn_weeks), belum disapa dalam
-- followup_window_days, dan belum punya booking. Tercatat sebagai follow-up (laporan "Follow-up dikirim/berhasil").
create function auto_followup() returns int language plpgsql security definer set search_path = public as $$
declare s settings; rows jsonb;
begin
  select * into s from settings;
  if not s.auto_followup_on then return 0; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'wa', c.whatsapp,
           'body', replace(s.wa_followup_template, '{nama}', case when trim(c.name) ~* '^no name$' then 'Kak' else split_part(trim(c.name), ' ', 1) end))), '[]')
    into rows
  from customers c join last_visits() lv on lv.customer_id = c.id
  where c.deleted_at is null and coalesce(c.whatsapp, '') <> ''
    and lv.last_at < now() - make_interval(weeks => s.churn_weeks)
    and lv.last_at >= now() - make_interval(weeks => s.churn_weeks + 1)
    and not exists (select 1 from followup_events f where f.customer_id = c.id and f.created_at > now() - make_interval(days => s.followup_window_days))
    and not exists (select 1 from appointments a where a.customer_id = c.id and a.status in ('pending_review', 'booked') and a.start_at > now());
  insert into followup_events (customer_id, sent_by) select (r ->> 'id')::uuid, null from jsonb_array_elements(rows) r;
  return enqueue_auto_promo('followup', rows);
end $$;

-- Minta ulasan Google: sekali seumur pelanggan, beberapa jam setelah transaksi pertamanya yang tercatat.
create function auto_review_request() returns int language plpgsql security definer set search_path = public as $$
declare url text; rows jsonb;
begin
  select google_review_url into url from settings;
  if url is null then return 0; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'wa', c.whatsapp, 'body', format(
           E'Halo Kak%s, terima kasih sudah berkunjung ke D''Pras Studio.\nBila berkenan, ceritakan pengalaman Kakak lewat ulasan singkat di Google:\n%s\nUlasan Kakak sangat membantu kami, juga teman-teman yang sedang mencari barbershop. Sampai bertemu lagi,',
           case when trim(c.name) ~* '^no name$' then '' else ' ' || split_part(trim(c.name), ' ', 1) end, url))), '[]')
    into rows
  from customers c
  where c.deleted_at is null and coalesce(c.whatsapp, '') <> ''
    and exists (select 1 from transactions t where t.customer_id = c.id and t.voided_at is null
                  and t.created_at between now() - interval '1 day' and now() - interval '2 hours')
    and not exists (select 1 from outbound_messages o join campaign_sends cs on cs.id = o.send_id join campaigns k on k.id = cs.campaign_id
                    where o.customer_id = c.id and k.auto_kind = 'review');
  return enqueue_auto_promo('review', rows);
end $$;

-- Kamis 16.00: progres Senin–Kamis vs target 5,5/hari, dibanding titik yang sama minggu lalu.
create function alert_midweek() returns void language plpgsql security definer set search_path = public as $$
declare w date := date_trunc('week', jkt_today())::date; per_day text; n int; prev int; wkend int; fu int;
begin
  select string_agg(x.lbl || ' ' || x.k, ' · ' order by x.d), coalesce(sum(x.k), 0) into per_day, n from (
    select d, (array['Sen', 'Sel', 'Rab', 'Kam'])[i + 1] as lbl,
           (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id
            where t.voided_at is null and s.category = 'barbershop' and is_cut_service(s.name)
              and (t.created_at at time zone 'Asia/Jakarta')::date = d)::int as k
    from generate_series(0, 3) i, lateral (select w + i as d) dd) x;
  select count(*) into prev from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id
  where t.voided_at is null and s.category = 'barbershop' and is_cut_service(s.name)
    and t.created_at >= jkt(w - 7, '00:00') and t.created_at < now() - interval '7 days';
  select count(*) into wkend from appointments a join resources r on r.id = a.resource_id
  where r.type = 'barbershop' and a.status in ('pending_review', 'booked') and (a.start_at at time zone 'Asia/Jakarta')::date between w + 4 and w + 6;
  select count(*) into fu from last_visits() where last_at < now() - make_interval(weeks => (select churn_weeks from settings));
  perform safe_alert(format(E'📊 Cek tengah minggu\nPotong Sen–Kam sejauh ini: %s (%s) · target 22 (5,5/hari) · minggu lalu di jam yang sama %s\nBooking Jum–Min yang sudah masuk: %s\n%s',
    n, per_day, prev, wkend,
    case when n < 22 then format('Kurang %s potong dari target. Pelanggan "Perlu follow-up": %s → sapa dari menu Pelanggan, tawarkan voucher Senin–Kamis untuk minggu depan.', 22 - n, fu)
         else 'Target Senin–Kamis sudah tercapai 👍' end));
end $$;

-- Senin 09.00: rapor minggu lalu ke WA tiap capster (nomor dari akun yang ditautkan ke staf).
create function staff_weekly_report() returns int language plpgsql security definer set search_path = public as $$
declare w date := date_trunc('week', jkt_today() - 7)::date; n int;
begin
  with cut as (
    select ti.staff_id, extract(isodow from t.created_at at time zone 'Asia/Jakarta')::int as dow, s.name ilike '%groom%' as groom,
           exists (select 1 from transaction_items x where x.transaction_id = t.id and x.category in ('massage', 'retail')) as addon,
           t.created_at >= jkt(w, '00:00') as cur
    from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id
    where t.voided_at is null and s.category = 'barbershop' and is_cut_service(s.name)
      and t.created_at >= jkt(w - 7, '00:00') and t.created_at < jkt(w + 7, '00:00')
  ), agg as (
    select staff_id, count(*) filter (where cur) as n, count(*) filter (where cur and dow <= 4) as senkam,
           count(*) filter (where cur and groom) as groom, count(*) filter (where cur and addon) as addon, count(*) filter (where not cur) as prev
    from cut group by staff_id
  ), pay as (select staff_id, sum(amount)::bigint as amt from commission_week_rows(w) group by staff_id),
  ins as (
    insert into outbound_messages (channel, to_address, template, body)
    select 'whatsapp', normalize_wa(p.phone), 'staff_report', format(
      E'📋 Rapor minggu %s · %s\nPotong %s (Sen–Kam %s · Jum–Min %s) · minggu sebelumnya %s\nPaket Groom %s · dengan tambahan pijat/retail %s\nBayaran: %s\nTerima kasih untuk kerja kerasnya minggu lalu 🙏',
      fmt_minggu(w), st.name, a.n, a.senkam, a.n - a.senkam, a.prev, a.groom, a.addon, fmt_rp(coalesce(pay.amt, 0)))
    from staff st join agg a on a.staff_id = st.id join profiles p on p.staff_id = st.id and p.active
    left join pay on pay.staff_id = st.id
    where st.active and a.n > 0 and normalize_wa(p.phone) is not null
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

revoke execute on function enqueue_auto_promo(text, jsonb), auto_followup(), auto_review_request(), alert_midweek(), staff_weekly_report()
  from public, anon, authenticated;

select cron.schedule('gb-ajak-potong-lagi', '0 3 * * *', $$select public.auto_followup()$$);          -- 10.00 WIB
select cron.schedule('gb-minta-ulasan', '0 6,13 * * *', $$select public.auto_review_request()$$);    -- 13.00 & 20.00 WIB
select cron.schedule('gb-cek-tengah-minggu', '0 9 * * 4', $$select public.alert_midweek()$$);        -- Kamis 16.00 WIB
select cron.schedule('gb-rapor-capster', '0 2 * * 1', $$select public.staff_weekly_report()$$);      -- Senin 09.00 WIB
