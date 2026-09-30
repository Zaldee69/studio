-- Tahap 3 — Wajah publik: konten landing dari Pengaturan, jam buka per hari, foto, ulasan asli,
-- aturan booking online (lead/buffer/batas hari/cutoff/mode review), grup booking + kode + idempotensi,
-- jadwal ulang, hapus akun, antrean notifikasi (email/WA) + pengingat H-1, funnel analitik.

-- ---------- A. Konten & aturan (settings) ----------
alter table settings
  add column tagline text not null default 'Barbershop & nail spa dalam satu atap',
  add column hero_title text not null default 'Seni merawat diri,',
  add column hero_title_accent text not null default 'berdua.',
  add column hero_text text not null default 'Grooming untuk dia, perawatan kuku untuk kamu — di satu ruang yang tenang, dilayani bersamaan.',
  add column groom_text text not null default 'Potongan presisi, cukur handuk hangat, hair spa. Kapster yang mengingat ukuran clipper Anda.',
  add column bloom_text text not null default 'Manicure, pedicure, gel polish, dan nail art — dikerjakan pelan, rapi, dengan alat yang steril.',
  add column standards jsonb not null default '[
    {"title": "Steril, setiap hari", "text": "Setiap alat dicuci, direndam disinfektan, lalu di-autoclave — tercatat dan diperiksa manajer."},
    {"title": "Kami mengingat Anda", "text": "Ukuran clipper, warna gel favorit, kulit sensitif — tersimpan untuk kunjungan berikutnya."},
    {"title": "Jam yang benar-benar kosong", "text": "Reservasi online hanya menampilkan jam yang tersedia saat itu juga."},
    {"title": "Datang berdua", "text": "Barbershop dan nail di jam yang sama, satu tagihan."}]',
  add column maps_embed_url text not null default '' check (maps_embed_url = '' or maps_embed_url ~ '^https://(www\.)?google\.[a-z.]+/maps/embed'),
  add column founded_year int check (founded_year between 1900 and 2100),
  add column show_staff boolean not null default true,
  add column show_prices boolean not null default true,
  add column online_booking_open boolean not null default true,
  add column booking_lead_minutes int not null default 60 check (booking_lead_minutes between 0 and 2880),
  add column booking_buffer_minutes int not null default 0 check (booking_buffer_minutes between 0 and 120),
  add column booking_max_days_ahead int not null default 14 check (booking_max_days_ahead between 1 and 90),
  add column cancel_cutoff_hours int not null default 2 check (cancel_cutoff_hours between 0 and 72),
  add column online_booking_mode text not null default 'auto' check (online_booking_mode in ('auto', 'review')),
  add column privacy_policy text not null default
'Kebijakan privasi {nama_toko}

Data yang kami kumpulkan
Saat Anda melakukan reservasi atau membuat akun, kami menyimpan nama, nomor WhatsApp, email (bila diisi), riwayat layanan, catatan preferensi layanan, serta transaksi dan saldo deposit Anda.

Tujuan
Data dipakai untuk mengatur jadwal, menghubungi Anda terkait booking (konfirmasi, pengingat, perubahan), memberikan layanan sesuai preferensi, dan pembukuan toko. Kami tidak menjual data Anda.

Penyimpanan
Data disimpan di layanan cloud yang aman dengan akses terbatas untuk tim toko sesuai perannya. Data transaksi disimpan selama diwajibkan untuk pembukuan.

Hak Anda
Anda berhak mengakses, memperbaiki, dan menghapus data pribadi Anda. Akun dapat dihapus kapan saja dari halaman Akun; data pribadi akan dianonimkan, sementara catatan transaksi tetap disimpan untuk pembukuan.

Kontak
{nama_toko} · {alamat} · WhatsApp {whatsapp}';

-- Jam buka per hari (0 = Minggu … 6 = Sabtu) & hari libur khusus.
create table opening_hours (
  weekday smallint primary key check (weekday between 0 and 6),
  open_time time not null default '09:00',
  close_time time not null default '21:00',
  closed boolean not null default false,
  check (closed or close_time > open_time)
);
insert into opening_hours (weekday, open_time, close_time) select d, s.open_time, s.close_time from generate_series(0, 6) d, settings s;

create table special_closures (
  date date primary key,
  reason text not null default ''
);

-- Grid Jadwal konter memakai settings.open_time/close_time → ikuti rentang terluas jam buka per hari.
create function sync_grid_hours() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update settings set open_time = coalesce((select min(open_time) from opening_hours where not closed), open_time),
                      close_time = coalesce((select max(close_time) from opening_hours where not closed), close_time);
  return null;
end $$;
create trigger opening_hours_sync after insert or update or delete on opening_hours
  for each statement execute function sync_grid_hours();

-- Foto (Supabase Storage bucket "site") & ulasan asli.
create table site_photos (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('hero', 'groom', 'bloom', 'gallery')),
  path text not null,
  caption text not null default '',
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table staff add column photo_path text;

create table reviews (
  id uuid primary key default gen_random_uuid(),
  author text not null check (length(trim(author)) > 0),
  source text not null default '',
  body text not null check (length(trim(body)) > 0),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table services
  add column online_bookable boolean not null default true,
  add column public_description text not null default '';
update services set online_bookable = false where category = 'retail';

do $$
declare t text;
begin
  foreach t in array array['opening_hours', 'special_closures', 'site_photos', 'reviews'] loop
    execute format('alter table %I enable row level security', t);
    execute format($f$create policy manager_all on %I for all to authenticated
                      using (auth_role() = 'manager') with check (auth_role() = 'manager')$f$, t);
  end loop;
end $$;
create policy public_read on opening_hours for select to anon, authenticated using (true);
create policy public_read on special_closures for select to anon, authenticated using (true);
create policy public_read on site_photos for select to anon, authenticated using (true);
create policy public_read on reviews for select to anon, authenticated using (active);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site', 'site', true, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;
create policy site_manager_insert on storage.objects for insert to authenticated with check (bucket_id = 'site' and auth_role() = 'manager');
create policy site_manager_update on storage.objects for update to authenticated using (bucket_id = 'site' and auth_role() = 'manager');
create policy site_manager_delete on storage.objects for delete to authenticated using (bucket_id = 'site' and auth_role() = 'manager');

-- View publik: kolom baru ditambahkan di akhir (create or replace view).
create or replace view public_services as
  select id, name, category, price, duration_min, needs_pedicure, upsell_service_id, sort, online_bookable, public_description
  from services where active;

create or replace view public_staff as
  select id, name, category, sort, photo_path from staff where active;

create or replace view public_settings as
  select shop_name, shop_address, shop_whatsapp, shop_instagram, open_time, close_time,
         bundle_pct, churn_weeks, wa_followup_template,
         tagline, hero_title, hero_title_accent, hero_text, groom_text, bloom_text, standards, maps_embed_url, founded_year,
         show_staff, show_prices, online_booking_open, booking_lead_minutes, booking_max_days_ahead, cancel_cutoff_hours,
         online_booking_mode, privacy_policy
  from settings;

-- ---------- Tutup celah: pelanggan tidak membaca catatan preferensi internal ----------
drop policy self_read on customers;
create view my_customer as
  select id, name, whatsapp, email from customers where id = my_customer_id();
-- customer_stats memakai filter peran sendiri; jalankan sebagai pemilik agar pelanggan tetap melihat statistiknya.
alter view customer_stats set (security_invoker = false);

-- ---------- Grup booking (kode singkat, idempotensi, jadwal ulang) ----------
create table booking_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  customer_id uuid references customers (id) on delete set null,
  source appt_source not null default 'online',
  client_request_id text unique,
  rescheduled_from uuid references booking_groups (id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table booking_groups enable row level security;
create policy front_read on booking_groups for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy customer_own on booking_groups for select to authenticated using (auth_role() = 'customer' and customer_id = my_customer_id());
alter table appointments add column booking_group_id uuid references booking_groups (id);
create index appointments_group_idx on appointments (booking_group_id);

create function gen_booking_code() returns text language plpgsql as $$
declare c text; alphabet text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  loop
    c := 'GB-' || (select string_agg(substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1), '') from generate_series(1, 4));
    exit when not exists (select 1 from booking_groups where code = c);
  end loop;
  return c;
end $$;

-- ---------- Aturan slot: jam per hari, libur, lead, buffer, batas hari, izin, online_bookable ----------
drop function create_online_booking(date, text, uuid[], jsonb, boolean, text, text, text, text);
drop function get_available_slots(date, uuid[], jsonb, boolean);
drop function plan_booking(date, int, uuid[], jsonb, boolean);

create function plan_booking(p_date date, p_start int, p_service_ids uuid[], p_staff_pick jsonb, p_together boolean,
                             p_buffer int default 0, p_exclude_group uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g record; t int := p_start; a0 timestamptz; b0 timestamptz; res uuid; stf uuid; pick uuid; buf interval := make_interval(mins => p_buffer);
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
                      and x.booking_group_id is distinct from p_exclude_group
                      and x.start_at - buf < b0 and x.end_at + buf > a0)
    order by (r.is_pedicure = g.pedi) desc, r.sort, r.name
    limit 1;
    if res is null then return null; end if;

    pick := nullif(coalesce(p_staff_pick, '{}') ->> g.cat, '')::uuid;
    select s.id into stf from staff s
    where s.active and s.category::text = g.cat and (pick is null or s.id = pick)
      and not exists (select 1 from appointments x where x.staff_id = s.id and x.status <> 'cancelled'
                      and x.booking_group_id is distinct from p_exclude_group
                      and x.start_at - buf < b0 and x.end_at + buf > a0)
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

-- Jendela buka satu tanggal: null bila tutup (hari libur mingguan / libur khusus).
create function day_window(p_date date) returns table (open_m int, close_m int)
language sql stable security definer set search_path = public as $$
  select extract(epoch from h.open_time)::int / 60, extract(epoch from h.close_time)::int / 60
  from opening_hours h
  where h.weekday = extract(dow from p_date) and not h.closed
    and not exists (select 1 from special_closures c where c.date = p_date)
$$;

create function get_available_slots(p_date date, p_service_ids uuid[], p_staff_pick jsonb default '{}', p_together boolean default true,
                                    p_exclude_group uuid default null)
returns setof text language plpgsql stable security definer set search_path = public as $$
declare
  st settings; w record; total int; min_m int; t int;
begin
  select * into st from settings;
  if not st.online_booking_open or p_date < jkt_today() or p_date > jkt_today() + st.booking_max_days_ahead then return; end if;
  select * into w from day_window(p_date);
  if w is null or w.open_m is null then return; end if;
  if exists (select 1 from unnest(p_service_ids) sid left join services s on s.id = sid
             where s.id is null or not s.active or not s.online_bookable or s.category = 'retail') then return; end if;

  select case when p_together then max(d) else sum(d) end into total
  from (select sum(duration_min) as d from services where id = any (p_service_ids) group by category) x;
  if total is null then return; end if;

  -- lead time: mulai paling cepat sekarang + booking_lead_minutes
  min_m := case
    when p_date = jkt_today() then (extract(epoch from (now() at time zone 'Asia/Jakarta')::time)::int / 60) + st.booking_lead_minutes
    when p_date = jkt_today() + 1 then (extract(epoch from (now() at time zone 'Asia/Jakarta')::time)::int / 60) + st.booking_lead_minutes - 1440
    else 0 end;

  t := w.open_m;
  while t + total <= w.close_m loop
    if t >= min_m and plan_booking(p_date, t, p_service_ids, p_staff_pick, p_together, st.booking_buffer_minutes, p_exclude_group) is not null then
      return next to_char(make_time(t / 60, t % 60, 0), 'HH24:MI');
    end if;
    t := t + 30;
  end loop;
end $$;

-- Tanggal terdekat yang masih punya slot (saran saat tanggal pilihan penuh).
create function next_available_date(p_from date, p_service_ids uuid[], p_staff_pick jsonb default '{}', p_together boolean default true)
returns date language plpgsql stable security definer set search_path = public as $$
declare d date := greatest(p_from, jkt_today()); last date := jkt_today() + (select booking_max_days_ahead from settings);
begin
  while d <= last loop
    if exists (select 1 from get_available_slots(d, p_service_ids, p_staff_pick, p_together)) then return d; end if;
    d := d + 1;
  end loop;
  return null;
end $$;

-- Pratinjau penugasan ("Siapa saja" → nama staf) sebelum konfirmasi. Hanya nama (publik).
create function preview_booking(p_date date, p_time text, p_service_ids uuid[], p_staff_pick jsonb default '{}', p_together boolean default true)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('category', g ->> 'category', 'start_at', g -> 'start_at',
           'staff_name', (select name from staff where id = (g ->> 'staff_id')::uuid))), '[]')
  from jsonb_array_elements(coalesce(plan_booking(p_date, extract(epoch from p_time::time)::int / 60, p_service_ids, p_staff_pick, p_together,
                                                  (select booking_buffer_minutes from settings)), '[]')) g
$$;

-- Staf yang izin sepanjang jam buka tanggal itu (disembunyikan di langkah Staf).
create function public_staff_off(p_date date) returns setof uuid
language sql stable security definer set search_path = public as $$
  select o.staff_id from staff_time_off o, day_window(p_date) w
  where o.status = 'approved'
    and o.start_at <= jkt(p_date, '00:00') + make_interval(mins => w.open_m)
    and o.end_at >= jkt(p_date, '00:00') + make_interval(mins => w.close_m)
$$;

-- ---------- C/D. Booking online (hanya dipanggil server setelah captcha) ----------
-- p: {actor?, ip?, client_request_id?, date, time, service_ids[], staff_pick{}, together, name?, whatsapp?, notes?, reschedule_group?}
-- Tidak melempar error untuk penolakan bisnis → percobaan (rate limit) tetap tercatat. Mengembalikan {ok, code, ...}.
create function book_online(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  st settings; actor uuid := nullif(p ->> 'actor', '')::uuid; prof profiles; cid uuid; wa text; ip text := coalesce(nullif(p ->> 'ip', ''), '');
  rl_key text; d date := (p ->> 'date')::date; tm text := p ->> 'time'; ids uuid[];
  pick jsonb := coalesce(p -> 'staff_pick', '{}'); together boolean := coalesce((p ->> 'together')::boolean, true);
  resched uuid := nullif(p ->> 'reschedule_group', '')::uuid; req text := nullif(p ->> 'client_request_id', '');
  grp booking_groups; plan jsonb; g jsonb; aid uuid; out jsonb := '[]'; first_start timestamptz;
  err text;
begin
  select * into st from settings;
  select array_agg(x::uuid) into ids from jsonb_array_elements_text(coalesce(p -> 'service_ids', '[]')) x;

  -- idempotensi: klik ganda / refresh mengembalikan hasil yang sama
  if req is not null then
    select * into grp from booking_groups where client_request_id = req;
    if found then
      return jsonb_build_object('ok', true, 'duplicate', true, 'group_id', grp.id, 'code', grp.code,
        'appointments', (select jsonb_agg(jsonb_build_object('id', a.id, 'category', r.type, 'start_at', a.start_at, 'status', a.status,
                           'staff_name', s.name) order by a.start_at)
                         from appointments a join resources r on r.id = a.resource_id left join staff s on s.id = a.staff_id
                         where a.booking_group_id = grp.id));
    end if;
  end if;

  if not st.online_booking_open then return jsonb_build_object('ok', false, 'code', 'closed', 'message', 'Booking online sedang ditutup'); end if;
  if coalesce(array_length(ids, 1), 0) = 0 then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Pilih layanan'); end if;

  if actor is not null then
    select * into prof from profiles where id = actor and active;
    if not found or prof.role <> 'customer' then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Tim memakai jadwal admin'); end if;
    cid := prof.customer_id;
    rl_key := 'user:' || actor;
  else
    if resched is not null then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Masuk untuk menjadwal ulang'); end if;
    wa := normalize_wa(p ->> 'whatsapp');
    if wa is null then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'No. WhatsApp tidak valid'); end if;
    if length(trim(coalesce(p ->> 'name', ''))) = 0 then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Nama wajib diisi'); end if;
    rl_key := 'wa:' || wa;
  end if;

  -- rate limit: 5 percobaan / 10 menit per identitas dan per IP
  if (select count(*) from booking_attempts where key = rl_key and created_at > now() - interval '10 minutes') >= 5
     or (ip <> '' and (select count(*) from booking_attempts where key = 'ip:' || ip and created_at > now() - interval '10 minutes') >= 5) then
    return jsonb_build_object('ok', false, 'code', 'rate', 'message', 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
  end if;
  insert into booking_attempts (key) values (rl_key);
  if ip <> '' then insert into booking_attempts (key) values ('ip:' || ip); end if;

  -- tamu: maks 2 booking aktif per no. WA
  if actor is null and (select count(distinct coalesce(a.booking_group_id, a.id)) from appointments a join customers c on c.id = a.customer_id
                        where c.whatsapp = wa and a.start_at > now() and a.status in ('pending_review', 'booked')) >= 2 then
    return jsonb_build_object('ok', false, 'code', 'limit', 'message', 'No. WhatsApp ini sudah punya 2 booking aktif. Masuk ke akun atau hubungi toko.');
  end if;

  if resched is not null then
    if not exists (select 1 from booking_groups where id = resched and customer_id = cid) then
      return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Booking tidak ditemukan');
    end if;
    if exists (select 1 from appointments where booking_group_id = resched
               and (status not in ('booked', 'pending_review') or start_at - now() < make_interval(hours => st.cancel_cutoff_hours))) then
      return jsonb_build_object('ok', false, 'code', 'cutoff', 'message', format('Jadwal ulang hanya bisa sampai %s jam sebelum mulai', st.cancel_cutoff_hours));
    end if;
  end if;

  begin  -- subtransaksi: gagal → batal semua perubahan di blok ini, percobaan di atas tetap tercatat
    perform lock_booking_day(d);
    -- permintaan kembar yang menunggu kunci: kembar pertama sudah commit → kembalikan hasil yang sama
    if req is not null and exists (select 1 from booking_groups where client_request_id = req) then
      raise exception using message = 'duplicate';
    end if;
    if not exists (select 1 from get_available_slots(d, ids, pick, together, resched) s where s = tm) then
      raise exception using message = 'slot_taken';
    end if;
    plan := plan_booking(d, extract(epoch from tm::time)::int / 60, ids, pick, together, st.booking_buffer_minutes, resched);

    if cid is null then
      insert into customers (name, whatsapp, created_by) values (trim(p ->> 'name'), wa, null)
      on conflict (whatsapp) do update set whatsapp = excluded.whatsapp
      returning id into cid;
    end if;
    if resched is not null then
      update appointments set status = 'cancelled', cancel_reason = 'Dijadwal ulang oleh pelanggan' where booking_group_id = resched;
    end if;

    insert into booking_groups (code, customer_id, source, client_request_id, rescheduled_from, created_by)
    values (gen_booking_code(), cid, 'online', req, resched, actor) returning * into grp;

    for g in select * from jsonb_array_elements(plan) loop
      insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes, created_by, status, booking_group_id)
      values (cid, (g ->> 'resource_id')::uuid, (g ->> 'staff_id')::uuid, (g ->> 'start_at')::timestamptz, (g ->> 'duration_min')::int,
              'online', coalesce(p ->> 'notes', ''), actor,
              case when st.online_booking_mode = 'review' then 'pending_review'::appt_status else 'booked' end, grp.id)
      returning id into aid;
      insert into appointment_services (appointment_id, service_id) select aid, x::uuid from jsonb_array_elements_text(g -> 'service_ids') x;
      out := out || jsonb_build_array(jsonb_build_object('id', aid, 'category', g ->> 'category', 'start_at', g -> 'start_at',
        'status', case when st.online_booking_mode = 'review' then 'pending_review' else 'booked' end,
        'staff_name', (select name from staff where id = (g ->> 'staff_id')::uuid)));
    end loop;
  exception
    when unique_violation then  -- permintaan kembar yang datang bersamaan
      select * into grp from booking_groups where client_request_id = req;
      if found then return book_online(p); end if;
      raise;
    when raise_exception then
      get stacked diagnostics err = message_text;
      if err = 'duplicate' then return book_online(p); end if;
      if err = 'slot_taken' then
        return jsonb_build_object('ok', false, 'code', 'slot_taken', 'message', 'Jam itu baru saja terisi — pilih jam lain');
      end if;
      raise;
  end;

  return jsonb_build_object('ok', true, 'group_id', grp.id, 'code', grp.code, 'appointments', out,
                            'status', case when st.online_booking_mode = 'review' then 'pending_review' else 'booked' end);
end $$;

-- Batal oleh pelanggan: seluruh grup, hanya sampai cancel_cutoff_hours sebelum mulai.
create or replace function cancel_my_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare a appointments; hrs int := (select cancel_cutoff_hours from settings);
begin
  perform require_role('customer');
  select * into a from appointments where id = p_id and customer_id = my_customer_id();
  if not found then raise exception 'Booking tidak ditemukan'; end if;
  if exists (select 1 from appointments x where (x.id = a.id or (a.booking_group_id is not null and x.booking_group_id = a.booking_group_id))
             and (x.status not in ('booked', 'pending_review') or x.start_at - now() < make_interval(hours => hrs))) then
    raise exception 'Pembatalan hanya bisa sampai % jam sebelum mulai. Hubungi toko lewat WhatsApp.', hrs;
  end if;
  update appointments set status = 'cancelled', cancel_reason = 'Dibatalkan pelanggan'
  where id = a.id or (a.booking_group_id is not null and booking_group_id = a.booking_group_id);
end $$;

-- Mode review: kasir/manajer menerima atau menolak (seluruh grup).
create function review_online_booking(p_group uuid, p_accept boolean, p_reason text default '') returns jsonb
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  perform require_role('manager', 'cashier');
  update appointments set status = case when p_accept then 'booked'::appt_status else 'cancelled' end,
    cancel_reason = case when p_accept then null else 'Ditolak toko' || coalesce(nullif(': ' || trim(p_reason), ': '), '') end
  where booking_group_id = p_group and status = 'pending_review';
  if not found then raise exception 'Booking tidak ditemukan atau sudah diputuskan'; end if;
  if p_accept then perform enqueue_group_messages(p_group, 'booking_confirmed'); end if;
  select jsonb_build_object('code', g.code, 'customer_name', c.name, 'whatsapp', c.whatsapp,
                            'start_at', (select min(start_at) from appointments where booking_group_id = g.id))
  into r from booking_groups g left join customers c on c.id = g.customer_id where g.id = p_group;
  return r;
end $$;

-- pending_review belum boleh dilayani/dibayar sebelum diterima.
create or replace function set_appointment_status(p_id uuid, p_status appt_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  if p_status in ('paid', 'cancelled', 'pending_review') then raise exception 'Gunakan kasir / batalkan / terima booking'; end if;
  update appointments set status = p_status where id = p_id and status not in ('paid', 'cancelled', 'pending_review');
  if not found then raise exception 'Booking tidak ditemukan, sudah lunas, dibatalkan, atau menunggu persetujuan'; end if;
end $$;

create or replace function guard_appt_paid() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    if current_setting('app.via_checkout', true) is distinct from 'on' then raise exception 'Status paid hanya lewat checkout'; end if;
    if old.status = 'pending_review' then raise exception 'Terima booking online dulu sebelum dibayar'; end if;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid'
     and (new.status, new.start_at, new.duration_min, new.resource_id, new.staff_id, new.customer_id)
         is distinct from (old.status, old.start_at, old.duration_min, old.resource_id, old.staff_id, old.customer_id)
     and current_setting('app.via_void', true) is distinct from 'on' then
    raise exception 'Booking lunas hanya bisa diubah lewat void transaksi';
  end if;
  return new;
end $$;

-- ---------- E. Profil & hapus akun pelanggan ----------
create function update_my_profile(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('customer');
  if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nama wajib diisi'; end if;
  update profiles set full_name = trim(p_name) where id = auth.uid();
  update customers set name = trim(p_name) where id = my_customer_id();
end $$;

-- Anonimkan data pribadi (UU PDP); transaksi tetap untuk pembukuan. Server lalu menghapus user auth.
create function delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare cid uuid := my_customer_id();
begin
  perform require_role('customer');
  update appointments set status = 'cancelled', cancel_reason = 'Akun pelanggan dihapus'
  where customer_id = cid and status in ('pending_review', 'booked') and start_at > now();
  update customers set name = 'Pelanggan dihapus', whatsapp = null, email = null, notes = '' where id = cid;
  update profiles set active = false, full_name = '', email = null, phone = null, customer_id = null where id = auth.uid();
end $$;

-- ---------- F. Antrean notifikasi (email / WhatsApp) + pengingat H-1 ----------
create table outbound_messages (
  id uuid primary key default gen_random_uuid(),
  channel text not null check (channel in ('email', 'whatsapp')),
  to_address text not null,
  template text not null check (template in ('booking_confirmed', 'booking_pending', 'reminder_h1')),
  booking_group_id uuid references booking_groups (id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text,
  send_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (template, booking_group_id, channel)
);
alter table outbound_messages enable row level security;
create policy manager_read on outbound_messages for select to authenticated using (auth_role() = 'manager');

create function enqueue_group_messages(p_group uuid, p_template text) returns void
language sql security definer set search_path = public as $$
  insert into outbound_messages (channel, to_address, template, booking_group_id)
  select ch, addr, p_template, p_group
  from booking_groups g join customers c on c.id = g.customer_id,
       lateral (values ('email', c.email), ('whatsapp', c.whatsapp)) v(ch, addr)
  where g.id = p_group and addr is not null and addr <> ''
  on conflict do nothing
$$;

-- Konfirmasi dikirim setelah appointment grup terisi (trigger AFTER INSERT appointments, sekali per grup).
create function enqueue_confirmation() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.booking_group_id is not null and new.source = 'online' then
    perform enqueue_group_messages(new.booking_group_id, case when new.status = 'pending_review' then 'booking_pending' else 'booking_confirmed' end);
  end if;
  return null;
end $$;
create trigger appointments_enqueue_confirmation after insert on appointments
  for each row execute function enqueue_confirmation();

create function enqueue_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with g as (
    select distinct a.booking_group_id as id from appointments a
    where a.booking_group_id is not null and a.status = 'booked'
      and (a.start_at at time zone 'Asia/Jakarta')::date = jkt_today() + 1
  ), ins as (
    insert into outbound_messages (channel, to_address, template, booking_group_id)
    select v.ch, v.addr, 'reminder_h1', g.id from g join booking_groups b on b.id = g.id join customers c on c.id = b.customer_id,
         lateral (values ('email', c.email), ('whatsapp', c.whatsapp)) v(ch, addr)
    where v.addr is not null and v.addr <> ''
    on conflict do nothing returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

-- Setiap pesan baru → minta server (/api/notifications/dispatch) mengirim; cron juga memanggilnya tiap menit untuk retry.
create function kick_dispatch() returns void language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  select value into url from app_config where key = 'notify_url';
  if url is null then return; end if;
  select value into secret from app_config where key = 'push_secret';
  perform net.http_post(url := url, body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')));
end $$;
create function outbound_kick() returns trigger language plpgsql security definer set search_path = public as $$
begin perform kick_dispatch(); return null; end $$;
create trigger outbound_messages_kick after insert on outbound_messages
  for each statement execute function outbound_kick();

create extension if not exists pg_cron;
select cron.schedule('gb-reminder-h1', '0 3 * * *', 'select public.enqueue_reminders()');  -- 10.00 WIB
select cron.schedule('gb-dispatch-retry', '*/5 * * * *',
  $$select public.kick_dispatch() where exists (select 1 from public.outbound_messages where status = 'queued' and send_after <= now())$$);

-- ---------- G. Funnel analitik ringan (tanpa cookie; sesi acak di sessionStorage) ----------
create table funnel_events (
  id bigint generated always as identity primary key,
  session_id text not null check (length(session_id) between 8 and 64),
  step text not null check (step in ('landing', 'booking_open', 'service', 'time', 'booked')),
  created_at timestamptz not null default now(),
  unique (session_id, step)
);
alter table funnel_events enable row level security;

create function track_funnel(p_session text, p_step text) returns void
language sql security definer set search_path = public as $$
  insert into funnel_events (session_id, step) values (p_session, p_step) on conflict do nothing
$$;

create function funnel_summary(p_from timestamptz default date_trunc('week', now())) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  perform require_role('manager');
  select jsonb_build_object(
    'landing', count(*) filter (where step = 'landing'),
    'booking_open', count(*) filter (where step = 'booking_open'),
    'service', count(*) filter (where step = 'service'),
    'time', count(*) filter (where step = 'time'),
    'booked', count(*) filter (where step = 'booked'),
    'online_bookings', (select count(*) from booking_groups where source = 'online' and created_at >= p_from))
  into r from funnel_events where created_at >= p_from;
  return r;
end $$;

-- ---------- Hak eksekusi ----------
revoke execute on function book_online(jsonb), plan_booking(date, int, uuid[], jsonb, boolean, int, uuid), lock_booking_day(date),
  gen_booking_code(), enqueue_group_messages(uuid, text), enqueue_reminders(), kick_dispatch(), day_window(date)
  from public, anon, authenticated;

alter publication supabase_realtime add table booking_groups;
