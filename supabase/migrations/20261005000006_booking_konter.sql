-- Dialog booking konter: perbaikan integritas.
--  1. Booking "Tidak datang" (no_show) tidak lagi memblokir kursi/staf (sama seperti dibatalkan).
--  2. Jeda antar-booking (settings.booking_buffer_minutes) juga berlaku di konter — sebelumnya hanya booking online.
--  3. Satu booking = satu kategori: layanan, kursi/meja, dan staf harus sekategori (barbershop ↔ kursi barber,
--     nail ↔ meja nail). Pasangan barber + nail = dua booking (aplikasi membuatnya sekaligus).
--  4. No. WA tanpa nama: pakai pelanggan pemilik nomor itu; bila belum ada, minta nama (dulu nomornya hilang diam-diam).

-- jeda booking terbaca konter (dipakai deteksi bentrok di layar)
create or replace view public_settings as
  select shop_name, shop_address, shop_whatsapp, shop_instagram, open_time, close_time,
         bundle_pct, churn_weeks, wa_followup_template,
         tagline, hero_title, hero_title_accent, hero_text, groom_text, bloom_text, standards, maps_embed_url, founded_year,
         show_staff, show_prices, online_booking_open, booking_lead_minutes, booking_max_days_ahead, cancel_cutoff_hours,
         online_booking_mode, privacy_policy, booking_buffer_minutes
  from settings;

create or replace function booking_conflicts(p_resource_id uuid, p_staff_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with b as (select make_interval(mins => booking_buffer_minutes) as buf from settings)
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'start_at', a.start_at, 'end_at', a.end_at,
           'customer_name', coalesce(c.name, 'Walk-in'), 'staff_name', s.name, 'resource_name', r.name,
           'same_resource', a.resource_id = p_resource_id, 'same_staff', a.staff_id = p_staff_id)
         order by a.start_at), '[]')
  from appointments a cross join b
  left join customers c on c.id = a.customer_id
  left join staff s on s.id = a.staff_id
  join resources r on r.id = a.resource_id
  where a.status not in ('cancelled', 'no_show') and a.start_at - b.buf < p_end and a.end_at + b.buf > p_start
    and (a.resource_id = p_resource_id or a.staff_id = p_staff_id)
    and a.id is distinct from p_exclude
$$;

-- Layanan, kursi/meja & staf satu kategori. Pesan error tampil apa adanya di dialog.
create function assert_booking_category(p_resource_id uuid, p_staff_id uuid, p_service_ids uuid[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare cats text[]; rtype text; scat text;
begin
  select array_agg(distinct category::text) into cats from services where id = any (p_service_ids) and category <> 'retail';
  if coalesce(array_length(cats, 1), 0) = 0 then raise exception 'Pilih minimal satu layanan jasa'; end if;
  if array_length(cats, 1) > 1 then
    raise exception 'Satu booking hanya untuk satu kategori — buat booking terpisah untuk layanan barbershop & nail';
  end if;
  select type::text into rtype from resources where id = p_resource_id;
  if rtype is distinct from cats[1] then
    raise exception 'Kursi/meja tidak sesuai layanan (layanan %, kursi/meja %)', cats[1], coalesce(rtype, '—');
  end if;
  select category::text into scat from staff where id = p_staff_id;
  if scat is distinct from cats[1] then
    raise exception 'Staf tidak sesuai layanan (layanan %, staf %)', cats[1], coalesce(scat, '—');
  end if;
end $$;

create or replace function create_booking_admin(
  p_resource_id uuid, p_staff_id uuid, p_start_at timestamptz, p_service_ids uuid[],
  p_customer_id uuid default null, p_name text default null, p_whatsapp text default null,
  p_source appt_source default 'admin', p_notes text default '', p_force boolean default false,
  p_duration int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  dur int; conflicts jsonb; cid uuid := p_customer_id; wa text; aid uuid; existing boolean := false;
begin
  perform require_role('manager', 'cashier');
  if p_source = 'online' then raise exception 'Gunakan create_online_booking'; end if;
  if coalesce(array_length(p_service_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu layanan'; end if;
  if p_duration is not null and p_duration not between 5 and 720 then raise exception 'Durasi tidak valid'; end if;
  perform assert_booking_category(p_resource_id, p_staff_id, p_service_ids);
  select coalesce(p_duration, nullif(sum(duration_min), 0), 30) into dur from services where id = any (p_service_ids);

  perform lock_booking_day((p_start_at at time zone 'Asia/Jakarta')::date);
  conflicts := booking_conflicts(p_resource_id, p_staff_id, p_start_at, p_start_at + make_interval(mins => dur));
  if jsonb_array_length(conflicts) > 0 and not p_force then
    return jsonb_build_object('saved', false, 'conflicts', conflicts);
  end if;

  if cid is null and trim(coalesce(p_whatsapp, '')) <> '' then
    wa := normalize_wa(p_whatsapp);
    if wa is null then raise exception 'No. WhatsApp tidak valid'; end if;
    select id into cid from customers where whatsapp = wa;
    existing := cid is not null;
    if cid is null and length(trim(coalesce(p_name, ''))) = 0 then
      raise exception 'Isi nama untuk pelanggan baru (atau kosongkan No. WhatsApp untuk walk-in)';
    end if;
  end if;
  if cid is null and length(trim(coalesce(p_name, ''))) > 0 then
    insert into customers (name, whatsapp) values (trim(p_name), wa) returning id into cid;
  end if;

  insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes)
  values (cid, p_resource_id, p_staff_id, p_start_at, dur, p_source, coalesce(p_notes, ''))
  returning id into aid;
  insert into appointment_services (appointment_id, service_id) select aid, unnest(p_service_ids);
  return jsonb_build_object('saved', true, 'appointment_id', aid, 'customer_id', cid,
                            'customer_existing', existing, 'conflicts', conflicts);
end $$;

create or replace function update_booking_admin(
  p_id uuid, p_resource_id uuid, p_staff_id uuid, p_start_at timestamptz, p_service_ids uuid[],
  p_duration int default null, p_notes text default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dur int; conflicts jsonb;
begin
  perform require_role('manager', 'cashier');
  if coalesce(array_length(p_service_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu layanan'; end if;
  if p_duration is not null and p_duration not between 5 and 720 then raise exception 'Durasi tidak valid'; end if;
  perform 1 from appointments where id = p_id and status not in ('paid', 'cancelled') for update;
  if not found then raise exception 'Booking tidak ditemukan, sudah lunas, atau dibatalkan'; end if;
  perform assert_booking_category(p_resource_id, p_staff_id, p_service_ids);
  select coalesce(p_duration, nullif(sum(duration_min), 0), 30) into dur from services where id = any (p_service_ids);

  perform lock_booking_day((p_start_at at time zone 'Asia/Jakarta')::date);
  conflicts := booking_conflicts(p_resource_id, p_staff_id, p_start_at, p_start_at + make_interval(mins => dur), p_id);
  if jsonb_array_length(conflicts) > 0 and not p_force then
    return jsonb_build_object('saved', false, 'conflicts', conflicts);
  end if;

  update appointments set resource_id = p_resource_id, staff_id = p_staff_id, start_at = p_start_at,
    duration_min = dur, notes = coalesce(p_notes, notes)
  where id = p_id;
  delete from appointment_services where appointment_id = p_id;
  insert into appointment_services (appointment_id, service_id) select p_id, unnest(p_service_ids);
  return jsonb_build_object('saved', true, 'appointment_id', p_id, 'conflicts', conflicts);
end $$;

revoke execute on function assert_booking_category(uuid, uuid, uuid[]) from public, anon, authenticated;
