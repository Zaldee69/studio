-- Upsell di awal (saat booking & saat pelanggan tiba), bukan di kasir. Penanda ikut ke transaksi → angka upsell staf tetap hidup.
alter table appointment_services
  add column from_upsell boolean not null default false,
  add column upsell_source text check (upsell_source in ('online', 'form', 'walk_in', 'tiba'));
alter table appointments add column upsell_offered boolean not null default false;

-- Tandai layanan hasil tawaran (p_service_ids boleh kosong = hanya mencatat "sudah ditawari").
create function upsell_mark(p_appointment uuid, p_service_ids uuid[], p_source text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  update appointment_services set from_upsell = true, upsell_source = p_source
   where appointment_id = p_appointment and service_id = any (coalesce(p_service_ids, '{}'));
  update appointments set upsell_offered = true where id = p_appointment;
end $$;

-- Pelanggan menolak / kasir melewati tawaran saat tiba → jangan ditawari lagi.
create function upsell_decline(p_appointment uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  update appointments set upsell_offered = true where id = p_appointment;
end $$;

-- Tambah layanan saat pelanggan tiba: durasi booking bertambah bila tidak bentrok dengan booking lain kapster/kursi yang sama.
create function upsell_add_on_arrival(p_appointment uuid, p_service_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a appointments%rowtype; dur int; clash timestamptz;
begin
  perform require_role('manager', 'cashier');
  select * into a from appointments where id = p_appointment for update;
  if not found or a.status not in ('booked', 'arrived') then return jsonb_build_object('ok', false, 'reason', 'status'); end if;
  select duration_min into dur from services where id = p_service_id and active;
  if dur is null or dur <= 0 then return jsonb_build_object('ok', false, 'reason', 'layanan'); end if;
  if exists (select 1 from appointment_services where appointment_id = p_appointment and service_id = p_service_id) then
    return jsonb_build_object('ok', false, 'reason', 'sudah_ada');
  end if;
  select min(x.start_at) into clash from appointments x
   where x.id <> a.id and x.status not in ('cancelled', 'paid', 'no_show')
     and (x.staff_id = a.staff_id or x.resource_id = a.resource_id)
     and x.start_at < a.end_at + make_interval(mins => dur) and x.end_at > a.start_at;
  if clash is not null then return jsonb_build_object('ok', false, 'reason', 'bentrok', 'next_start', clash); end if;
  insert into appointment_services (appointment_id, service_id, from_upsell, upsell_source) values (p_appointment, p_service_id, true, 'tiba');
  update appointments set duration_min = duration_min + dur, upsell_offered = true where id = p_appointment;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function upsell_mark(uuid, uuid[], text), upsell_decline(uuid), upsell_add_on_arrival(uuid, uuid) from public, anon;
grant execute on function upsell_mark(uuid, uuid[], text), upsell_decline(uuid), upsell_add_on_arrival(uuid, uuid) to authenticated;
