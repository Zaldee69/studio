-- CRM: campaign promosi WhatsApp yang bisa dipakai ulang (manajer). Campaign = nama + segmen + pesan; setiap "Kirim"
-- membuat campaign_sends (snapshot pesan & segmen saat itu) dan satu pesan per pelanggan di antrean outbound_messages
-- (dikirim lewat Wablas, dicoba ulang 3×). Penerima: semua pelanggan ber-WA kecuali yang minta berhenti (promo_opt_out —
-- ditandai kasir/manajer saat pelanggan membalas STOP).

alter table customers add column promo_opt_out boolean not null default false;

create table campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  message text not null check (length(message) between 10 and 900),
  segment jsonb not null default '{}',
  archived boolean not null default false,
  created_by uuid default auth.uid() references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table campaigns enable row level security;
create policy manager_all on campaigns for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');

create table campaign_sends (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references campaigns (id) on delete cascade,
  message text not null,
  segment jsonb not null,
  recipient_count int not null default 0,
  created_by uuid default auth.uid() references profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index campaign_sends_campaign_idx on campaign_sends (campaign_id, created_at desc);
alter table campaign_sends enable row level security;
create policy manager_read on campaign_sends for select to authenticated using (auth_role() = 'manager');

alter table outbound_messages drop constraint outbound_messages_template_check;
alter table outbound_messages add constraint outbound_messages_template_check
  check (template in ('booking_confirmed', 'booking_pending', 'reminder_h1', 'promo'));
alter table outbound_messages
  add column send_id uuid references campaign_sends (id) on delete cascade,
  add column customer_id uuid references customers (id) on delete set null,
  add column body text,
  add constraint outbound_promo_shape check (template <> 'promo' or (send_id is not null and body is not null)),
  add constraint outbound_send_once unique (send_id, customer_id);

-- Segmen (semua opsional, digabung AND):
--   inactive_weeks: terakhir datang ≥ N minggu lalu (pernah datang)   categories: pernah memakai salah satu kategori
--   min_visits / min_spend: pelanggan setia                            online: true = pernah booking online, false = belum
create function campaign_audience(p_segment jsonb)
returns table (customer_id uuid, name text, whatsapp text)
language plpgsql stable security definer set search_path = public as $$
declare
  weeks int := nullif(p_segment ->> 'inactive_weeks', '')::int;
  cats text[] := (select array_agg(x) from jsonb_array_elements_text(coalesce(p_segment -> 'categories', '[]')) x);
  min_visits int := nullif(p_segment ->> 'min_visits', '')::int;
  min_spend bigint := nullif(p_segment ->> 'min_spend', '')::bigint;
  online boolean := (p_segment ->> 'online')::boolean;
begin
  perform require_role('manager');
  return query
  select c.id, c.name, c.whatsapp
  from customers c left join customer_stats s on s.customer_id = c.id
  where c.whatsapp is not null and not c.promo_opt_out
    and (weeks is null or (s.last_visit_at is not null and s.last_visit_at < now() - make_interval(weeks => weeks)))
    and (min_visits is null or coalesce(s.visit_count, 0) >= min_visits)
    and (min_spend is null or coalesce(s.lifetime_value, 0) >= min_spend)
    and (cats is null or exists (select 1 from transactions t join transaction_items ti on ti.transaction_id = t.id
                                 where t.customer_id = c.id and t.voided_at is null and ti.category::text = any (cats)))
    and (online is null or online = exists (select 1 from appointments a where a.customer_id = c.id and a.source = 'online'))
  order by c.name;
end $$;

-- Kirim campaign (pesan & segmen saat ini). {nama} = nama depan, ditutup cara berhenti berlangganan.
create function send_campaign(p_campaign uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c campaigns; sid uuid; n int; shop text;
begin
  perform require_role('manager');
  select * into c from campaigns where id = p_campaign and not archived;
  if not found then raise exception 'Campaign tidak ditemukan'; end if;
  if (select count(*) from campaign_sends where created_by = auth.uid() and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Terlalu banyak pengiriman dalam 10 menit. Tunggu sebentar.';
  end if;
  select shop_name into shop from settings;
  insert into campaign_sends (campaign_id, message, segment) values (c.id, c.message, c.segment) returning id into sid;
  insert into outbound_messages (channel, to_address, template, send_id, customer_id, body)
  select 'whatsapp', a.whatsapp, 'promo', sid, a.customer_id,
         replace(c.message, '{nama}', split_part(trim(a.name), ' ', 1))
           || E'\n\n— ' || shop || E'\nTidak ingin menerima info promo? Balas STOP.'
  from campaign_audience(c.segment) a;
  get diagnostics n = row_count;
  if n = 0 then raise exception 'Tidak ada penerima untuk segmen ini.'; end if;
  update campaign_sends set recipient_count = n where id = sid;
  return jsonb_build_object('send_id', sid, 'recipients', n);
end $$;

-- Status per pengiriman (halaman Promosi).
create view campaign_send_stats with (security_invoker = true) as
  select s.id, s.campaign_id, s.recipient_count, s.created_at, p.full_name as created_by_name,
         count(m.id) filter (where m.status = 'sent') as sent,
         count(m.id) filter (where m.status = 'failed') as failed,
         count(m.id) filter (where m.status in ('queued', 'sending')) as pending,
         count(m.id) filter (where m.status = 'skipped') as skipped
  from campaign_sends s left join outbound_messages m on m.send_id = s.id left join profiles p on p.id = s.created_by
  group by s.id, p.full_name;

revoke execute on function campaign_audience(jsonb), send_campaign(uuid) from public, anon;
