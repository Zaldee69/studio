-- Tahap 2 — Aplikasi kapster: waktu nyata, view aman untuk kapster, koreksi status, komisi saya,
-- izin/cuti, permintaan ubah jadwal, Web Push, mode stasiun (PIN).

-- ---------- B. Waktu nyata ----------
alter table appointments
  add column arrived_at timestamptz,
  add column service_started_at timestamptz,
  add column service_ended_at timestamptz,
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column change_request text,
  add column change_requested_at timestamptz;

-- Dicap otomatis pada SETIAP perubahan status (RPC kapster, koreksi kasir, checkout, void).
-- Mundur status mengosongkan cap tahap yang dibatalkan.
create function stamp_appt_status() returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    new.status_changed_at := now();
    new.status_changed_by := auth.uid();
    case new.status
      when 'booked' then
        new.arrived_at := null; new.service_started_at := null; new.service_ended_at := null;
      when 'arrived' then
        new.arrived_at := coalesce(new.arrived_at, now()); new.service_started_at := null; new.service_ended_at := null;
      when 'in_service' then
        new.arrived_at := coalesce(new.arrived_at, now()); new.service_started_at := coalesce(new.service_started_at, now());
        new.service_ended_at := null;
      when 'completed' then
        new.service_ended_at := coalesce(new.service_ended_at, case when new.service_started_at is not null then now() end);
      when 'paid' then
        new.service_ended_at := coalesce(new.service_ended_at, case when new.service_started_at is not null then now() end);
      else null;
    end case;
  end if;
  return new;
end $$;
create trigger appointments_stamp_status before update of status on appointments
  for each row execute function stamp_appt_status();

-- Permintaan ubah jadwal hilang begitu konter memindahkan jam/kursi/kapster.
create function clear_change_request() returns trigger language plpgsql as $$
begin
  if (new.start_at, new.resource_id, new.staff_id) is distinct from (old.start_at, old.resource_id, old.staff_id) then
    new.change_request := null; new.change_requested_at := null;
  end if;
  return new;
end $$;
create trigger appointments_clear_change_request before update on appointments
  for each row execute function clear_change_request();

-- ---------- Batas akses kapster: tanpa no. WA / saldo / belanja ----------
drop policy staff_served on customers;

-- Booking milik kapster yang login (owner-rights view, disaring my_staff_id()). Tanpa WA & harga.
create view staff_my_appointments as
  select a.id, a.start_at, a.end_at, a.duration_min, a.status, a.source, a.notes,
         a.resource_id, r.name as resource_name, a.customer_id, c.name as customer_name, c.notes as customer_notes,
         a.arrived_at, a.service_started_at, a.service_ended_at, a.status_changed_at,
         (a.status_changed_by = auth.uid()) as changed_by_me, a.change_request, a.change_requested_at,
         array(select s.service_id from appointment_services s where s.appointment_id = a.id) as service_ids
  from appointments a
  join resources r on r.id = a.resource_id
  left join customers c on c.id = a.customer_id
  where a.staff_id = my_staff_id();

-- Kartu pelanggan yang pernah/akan dilayani kapster ini: nama + catatan saja.
create view staff_customer_card as
  select c.id, c.name, c.notes from customers c
  where exists (select 1 from appointments a where a.customer_id = c.id and a.staff_id = my_staff_id());

-- 3 kunjungan terakhir pelanggan dengan kapster ini.
create function staff_customer_history(p_customer_id uuid)
returns table (start_at timestamptz, services text, notes text)
language sql stable security definer set search_path = public as $$
  select a.start_at, string_agg(sv.name, ', ' order by sv.sort), a.notes
  from appointments a
  join appointment_services x on x.appointment_id = a.id
  join services sv on sv.id = x.service_id
  where a.customer_id = p_customer_id and a.staff_id = my_staff_id() and my_staff_id() is not null
    and a.status in ('completed', 'paid')
  group by a.id
  order by a.start_at desc
  limit 3
$$;

-- Koreksi: mundur satu langkah, hanya perubahan milik sendiri, maksimal 10 menit, tidak dari/ke paid.
create function revert_my_status(p_id uuid) returns appt_status
language plpgsql security definer set search_path = public as $$
declare a appointments; prev appt_status;
begin
  perform require_role('staff');
  select * into a from appointments where id = p_id for update;
  if not found or a.staff_id is distinct from my_staff_id() then raise exception 'Booking tidak ditemukan'; end if;
  prev := case a.status when 'arrived' then 'booked' when 'in_service' then 'arrived' when 'completed' then 'in_service' end;
  if prev is null then raise exception 'Status % tidak bisa dibatalkan', a.status; end if;
  if a.status_changed_by is distinct from auth.uid() or a.status_changed_at is null
     or a.status_changed_at < now() - interval '10 minutes' then
    raise exception 'Koreksi hanya bisa dalam 10 menit setelah Anda mengubah status — minta kasir mengoreksi';
  end if;
  update appointments set status = prev where id = p_id;
  -- satu langkah saja: koreksi berikutnya tidak bisa berantai
  update appointments set status_changed_at = null where id = p_id;
  return prev;
end $$;

-- Minta konter mengubah jadwal (kapster tidak mengubah jadwal sendiri).
create function request_schedule_change(p_id uuid, p_message text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('staff');
  if length(trim(coalesce(p_message, ''))) = 0 then raise exception 'Tulis pesan untuk konter'; end if;
  update appointments set change_request = trim(p_message), change_requested_at = now()
  where id = p_id and staff_id = my_staff_id() and status not in ('paid', 'cancelled');
  if not found then raise exception 'Booking tidak ditemukan'; end if;
end $$;

-- ---------- E. Komisi saya (rumus sama dengan staff_commission_monthly) ----------
create function staff_commission_items(p_month date, p_staff_id uuid default null)
returns table (transaction_item_id uuid, created_at timestamptz, name text, category service_category, net_amount bigint, commission numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  sid uuid; pct int;
  m0 timestamptz := jkt(date_trunc('month', p_month)::date, '00:00');
  m1 timestamptz := jkt((date_trunc('month', p_month) + interval '1 month')::date, '00:00');
begin
  perform require_role('manager', 'staff');
  sid := case when auth_role() = 'staff' then my_staff_id() else p_staff_id end;
  if sid is null then raise exception 'Staf tidak ditemukan'; end if;
  select coalesce(s.commission_pct_override, st.commission_pct) into pct from staff s, settings st where s.id = sid;
  return query
  select ti.id, t.created_at, ti.name, ti.category, ti.net_amount,
         greatest(0, ti.net_amount - coalesce(c.hpp, 0)) * pct / 100.0
  from transaction_items ti
  join transactions t on t.id = ti.transaction_id
  left join transaction_item_costs c on c.transaction_item_id = ti.id
  where ti.staff_id = sid and t.voided_at is null and ti.category <> 'retail'
    and t.created_at >= m0 and t.created_at < m1
  order by t.created_at desc;
end $$;

-- Rasio komisi & ambang minimum untuk kapster yang login (tanpa membuka tabel settings).
create function staff_commission_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ratio', coalesce(s.commission_pct_override, st.commission_pct), 'min_pay', st.min_monthly_pay)
  from staff s, settings st where s.id = my_staff_id()
$$;

-- Peringkat pendapatan jasa bulan itu — tanpa membuka angka staf lain.
create function staff_commission_rank(p_month date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := my_staff_id(); r jsonb;
  m0 timestamptz := jkt(date_trunc('month', p_month)::date, '00:00');
  m1 timestamptz := jkt((date_trunc('month', p_month) + interval '1 month')::date, '00:00');
begin
  perform require_role('staff');
  with rev as (
    select s.id, coalesce(sum(ti.net_amount) filter (where t.id is not null), 0) as net
    from staff s
    left join transaction_items ti on ti.staff_id = s.id and ti.category <> 'retail'
    left join transactions t on t.id = ti.transaction_id and t.voided_at is null and t.created_at >= m0 and t.created_at < m1
    where s.active group by s.id
  ), ranked as (select id, rank() over (order by net desc) as rk from rev)
  select jsonb_build_object('rank', (select rk from ranked where id = me), 'of', (select count(*) from ranked)) into r;
  return r;
end $$;

-- ---------- F. Izin / cuti ----------
create type time_off_status as enum ('pending', 'approved', 'rejected', 'cancelled');

create table staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default true,
  reason text not null default '',
  status time_off_status not null default 'pending',
  requested_by uuid default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_at > start_at and end_at - start_at <= interval '31 days')
);
create index staff_time_off_staff_idx on staff_time_off (staff_id, start_at);
alter table staff_time_off enable row level security;
create policy front_read on staff_time_off for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy staff_own on staff_time_off for select to authenticated using (auth_role() = 'staff' and staff_id = my_staff_id());

create function request_time_off(p_start timestamptz, p_end timestamptz, p_all_day boolean, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  perform require_role('staff');
  if my_staff_id() is null then raise exception 'Akun belum ditautkan ke data staf'; end if;
  if p_end <= p_start then raise exception 'Jam selesai harus setelah jam mulai'; end if;
  if p_end < now() then raise exception 'Tidak bisa mengajukan izin untuk waktu yang sudah lewat'; end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Isi alasan izin'; end if;
  insert into staff_time_off (staff_id, start_at, end_at, all_day, reason)
  values (my_staff_id(), p_start, p_end, coalesce(p_all_day, true), trim(p_reason)) returning staff_time_off.id into id;
  return id;
end $$;

create function cancel_time_off(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('staff');
  update staff_time_off set status = 'cancelled' where id = p_id and staff_id = my_staff_id() and status = 'pending';
  if not found then raise exception 'Pengajuan tidak ditemukan atau sudah diputuskan'; end if;
end $$;

create function decide_time_off(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  update staff_time_off set status = case when p_approve then 'approved'::time_off_status else 'rejected' end,
    decided_by = auth.uid(), decided_at = now()
  where id = p_id and status = 'pending' and requested_by is distinct from auth.uid();
  if not found then raise exception 'Pengajuan tidak ditemukan, sudah diputuskan, atau milik Anda sendiri'; end if;
end $$;

-- Manajer mencatat izin langsung (langsung disetujui).
create function create_time_off_admin(p_staff_id uuid, p_start timestamptz, p_end timestamptz, p_all_day boolean, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  perform require_role('manager');
  insert into staff_time_off (staff_id, start_at, end_at, all_day, reason, status, decided_by, decided_at)
  values (p_staff_id, p_start, p_end, coalesce(p_all_day, true), coalesce(trim(p_reason), ''), 'approved', auth.uid(), now())
  returning staff_time_off.id into id;
  return id;
end $$;

-- Booking yang terdampak izin (untuk dipindahkan konter).
create function time_off_conflicts(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'start_at', a.start_at, 'end_at', a.end_at,
           'customer_name', coalesce(c.name, 'Walk-in'), 'status', a.status) order by a.start_at), '[]')
  from staff_time_off t
  join appointments a on a.staff_id = t.staff_id and a.status not in ('cancelled', 'paid')
                     and a.start_at < t.end_at and a.end_at > t.start_at
  left join customers c on c.id = a.customer_id
  where t.id = p_id and auth_role() in ('manager', 'cashier')
$$;

-- Slot online tidak menawarkan staf yang izinnya disetujui.
create or replace function plan_booking(p_date date, p_start int, p_service_ids uuid[], p_staff_pick jsonb, p_together boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g record; t int := p_start; a0 timestamptz; b0 timestamptz; res uuid; stf uuid; pick uuid;
  out jsonb := '[]';
begin
  for g in
    select s.category::text as cat, array_agg(s.id order by s.sort, s.name) as ids,
           sum(s.duration_min)::int as dur, bool_or(s.needs_pedicure) as pedi
    from services s
    where s.id = any (p_service_ids) and s.active and s.category <> 'retail'
    group by s.category
    order by s.category
  loop
    a0 := jkt(p_date, '00:00') + make_interval(mins => t);
    b0 := a0 + make_interval(mins => g.dur);

    select r.id into res from resources r
    where r.active and r.type::text = g.cat
      and not exists (select 1 from appointments x where x.resource_id = r.id and x.status <> 'cancelled'
                      and x.start_at < b0 and x.end_at > a0)
    order by (r.is_pedicure = g.pedi) desc, r.sort, r.name
    limit 1;
    if res is null then return null; end if;

    pick := nullif(coalesce(p_staff_pick, '{}') ->> g.cat, '')::uuid;
    select s.id into stf from staff s
    where s.active and s.category::text = g.cat and (pick is null or s.id = pick)
      and not exists (select 1 from appointments x where x.staff_id = s.id and x.status <> 'cancelled'
                      and x.start_at < b0 and x.end_at > a0)
      and not exists (select 1 from staff_time_off o where o.staff_id = s.id and o.status = 'approved'
                      and o.start_at < b0 and o.end_at > a0)
    order by s.sort, s.name
    limit 1;
    if stf is null then return null; end if;

    out := out || jsonb_build_array(jsonb_build_object(
      'category', g.cat, 'service_ids', to_jsonb(g.ids), 'resource_id', res, 'staff_id', stf,
      'start_at', a0, 'duration_min', g.dur));
    if not p_together then t := t + g.dur; end if;
  end loop;
  return nullif(out, '[]');
end $$;
revoke execute on function plan_booking(date, int, uuid[], jsonb, boolean) from public, anon, authenticated;

-- ---------- C. Web Push ----------
create table push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade default auth.uid(),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);
alter table push_subscriptions enable row level security;
create policy own_all on push_subscriptions for all to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Simpan langganan untuk pengguna saat ini; perangkat yang ganti pengguna dipindahkan ke pengguna baru.
create function save_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Akses ditolak' using errcode = '42501'; end if;
  insert into push_subscriptions (profile_id, endpoint, p256dh, auth) values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update set profile_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth;
end $$;

-- Konfigurasi pengirim push (URL + rahasia). Tidak dibuka ke API; diisi lewat SQL per lingkungan.
create table app_config (key text primary key, value text not null);
alter table app_config enable row level security;
revoke all on app_config from anon, authenticated;

create extension if not exists pg_net;

-- Booking baru / dipindah / dibatalkan untuk seorang kapster → panggil /api/push (async, via pg_net).
create function notify_staff_push() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text; kind text;
begin
  select value into url from app_config where key = 'push_url';
  if url is null or new.staff_id is null then return null; end if;
  select value into secret from app_config where key = 'push_secret';
  kind := case
    when tg_op = 'INSERT' then 'new'
    when new.status = 'cancelled' and old.status <> 'cancelled' then 'cancelled'
    when new.staff_id is distinct from old.staff_id then 'new'
    when (new.start_at, new.resource_id) is distinct from (old.start_at, old.resource_id) then 'changed'
  end;
  if kind is null then return null; end if;
  perform net.http_post(url := url, body := jsonb_build_object('appointment_id', new.id, 'kind', kind),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')));
  return null;
end $$;
create trigger appointments_notify_push after insert or update on appointments
  for each row execute function notify_staff_push();

-- ---------- G. Mode stasiun (tablet bersama, masuk dengan PIN) ----------
create table station_devices (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token_hash text not null unique,
  active boolean not null default true,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz
);
alter table station_devices enable row level security;
create policy manager_all on station_devices for all to authenticated
  using (auth_role() = 'manager') with check (auth_role() = 'manager');

-- PIN disimpan sebagai hash bcrypt. Tidak ada policy → tidak terbaca dari API; semua lewat fungsi.
create table staff_pins (
  staff_id uuid primary key references staff (id) on delete cascade,
  pin_hash text not null,
  failed_attempts int not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
alter table staff_pins enable row level security;

create function set_staff_pin(p_staff_id uuid, p_pin text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform require_role('manager');
  if p_pin !~ '^\d{4,6}$' then raise exception 'PIN harus 4–6 digit angka'; end if;
  insert into staff_pins (staff_id, pin_hash) values (p_staff_id, crypt(p_pin, gen_salt('bf')))
  on conflict (staff_id) do update set pin_hash = excluded.pin_hash, failed_attempts = 0, locked_until = null, updated_at = now();
end $$;

create function clear_staff_pin(p_staff_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  delete from staff_pins where staff_id = p_staff_id;
end $$;

create function staff_pin_status() returns table (staff_id uuid, has_pin boolean, locked_until timestamptz, updated_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  return query select s.id, p.staff_id is not null, p.locked_until, p.updated_at
               from staff s left join staff_pins p on p.staff_id = s.id where s.active;
end $$;

create function register_station(p_name text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = public as $$
declare id uuid;
begin
  perform require_role('manager');
  insert into station_devices (name, token_hash) values (coalesce(nullif(trim(p_name), ''), 'Tablet stasiun'), p_token_hash)
  returning station_devices.id into id;
  return id;
end $$;

-- Tiga fungsi berikut HANYA untuk server (service role): dicabut dari anon/authenticated di bawah.
create function station_staff(p_token_hash text)
returns table (staff_id uuid, name text, category staff_category, has_pin boolean)
language plpgsql security definer set search_path = public as $$
begin
  update station_devices set last_seen_at = now() where token_hash = p_token_hash and active;
  if not found then raise exception 'Perangkat stasiun tidak terdaftar'; end if;
  return query
  select s.id, s.name, s.category, exists (select 1 from staff_pins p where p.staff_id = s.id)
  from staff s join profiles pr on pr.staff_id = s.id and pr.active and pr.role = 'staff'
  where s.active order by s.sort, s.name;
end $$;

-- Rate limit: 5 PIN salah → terkunci 5 menit.
create function verify_staff_pin(p_token_hash text, p_staff_id uuid, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare p staff_pins; em text;
begin
  if not exists (select 1 from station_devices where token_hash = p_token_hash and active) then
    return jsonb_build_object('ok', false, 'reason', 'device');
  end if;
  select * into p from staff_pins where staff_id = p_staff_id for update;
  if not found then return jsonb_build_object('ok', false, 'reason', 'no_pin'); end if;
  if p.locked_until > now() then return jsonb_build_object('ok', false, 'reason', 'locked', 'locked_until', p.locked_until); end if;
  if crypt(coalesce(p_pin, ''), p.pin_hash) <> p.pin_hash then
    update staff_pins set failed_attempts = failed_attempts + 1,
      locked_until = case when failed_attempts + 1 >= 5 then now() + interval '5 minutes' end
    where staff_id = p_staff_id;
    return jsonb_build_object('ok', false, 'reason', case when p.failed_attempts + 1 >= 5 then 'locked' else 'wrong' end,
                              'left', greatest(0, 4 - p.failed_attempts));
  end if;
  update staff_pins set failed_attempts = 0, locked_until = null where staff_id = p_staff_id;
  select pr.email into em from profiles pr where pr.staff_id = p_staff_id and pr.active and pr.role = 'staff';
  if em is null then return jsonb_build_object('ok', false, 'reason', 'no_account'); end if;
  return jsonb_build_object('ok', true, 'email', em);
end $$;

revoke execute on function station_staff(text), verify_staff_pin(text, uuid, text), notify_staff_push(),
  stamp_appt_status(), clear_change_request() from public, anon, authenticated;

alter publication supabase_realtime add table staff_time_off;
