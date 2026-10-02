-- Kursi/meja utama per staf (lunak): booking online & form konter mengutamakan kursi staf itu bila kosong,
-- tetapi tetap boleh memakai kursi lain (kapasitas tidak berkurang). Kosong = bebas di kursi mana saja.
alter table staff add column home_resource_id uuid references resources (id) on delete set null;

-- Kursi utama harus sekategori (kapster ↔ kursi barber, nail artist ↔ meja nail).
create function guard_staff_home_resource() returns trigger language plpgsql set search_path = public as $$
begin
  if new.home_resource_id is not null
     and not exists (select 1 from resources r where r.id = new.home_resource_id and r.type::text = new.category::text) then
    raise exception 'Kursi utama harus sesuai kategori staf' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger staff_home_resource before insert or update of home_resource_id, category on staff
  for each row execute function guard_staff_home_resource();

-- Sama seperti versi Tahap 3, kecuali:
--  - staf dipilih dulu, lalu kursinya — kursi utama staf itu diutamakan (setelah kecocokan kursi pedicure).
--  - PERBAIKAN BUG: `booking_group_id is distinct from p_exclude_group` bernilai false bila keduanya NULL, sehingga booking
--    konter/walk-in (tanpa grup) tidak dianggap bentrok → booking online bisa menimpa kursi & kapster yang sudah terisi.
--  - booking "Tidak datang" (no_show) tidak menutup slot, sama seperti dibatalkan.
create or replace function plan_booking(p_date date, p_start int, p_service_ids uuid[], p_staff_pick jsonb, p_together boolean,
                                        p_buffer int default 0, p_exclude_group uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g record; t int := p_start; a0 timestamptz; b0 timestamptz; res uuid; stf uuid; home uuid; pick uuid; buf interval := make_interval(mins => p_buffer);
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

    pick := nullif(coalesce(p_staff_pick, '{}') ->> g.cat, '')::uuid;
    select s.id, s.home_resource_id into stf, home from staff s
    where s.active and s.category::text = g.cat and (pick is null or s.id = pick)
      and not exists (select 1 from appointments x where x.staff_id = s.id and x.status not in ('cancelled', 'no_show')
                      and (p_exclude_group is null or x.booking_group_id is distinct from p_exclude_group)
                      and x.start_at - buf < b0 and x.end_at + buf > a0)
      and not exists (select 1 from staff_time_off o where o.staff_id = s.id and o.status = 'approved'
                      and o.start_at < b0 and o.end_at > a0)
    order by s.sort, s.name
    limit 1;
    if stf is null then return null; end if;

    select r.id into res from resources r
    where r.active and r.type::text = g.cat
      and not exists (select 1 from appointments x where x.resource_id = r.id and x.status not in ('cancelled', 'no_show')
                      and (p_exclude_group is null or x.booking_group_id is distinct from p_exclude_group)
                      and x.start_at - buf < b0 and x.end_at + buf > a0)
    order by (r.is_pedicure = g.pedi) desc, (r.id = home) desc nulls last, r.sort, r.name
    limit 1;
    if res is null then return null; end if;

    out := out || jsonb_build_array(jsonb_build_object(
      'category', g.cat, 'service_ids', to_jsonb(g.ids), 'resource_id', res, 'staff_id', stf,
      'start_at', a0, 'duration_min', g.dur));
    if not p_together then t := t + g.dur; end if;
  end loop;
  return nullif(out, '[]');
end $$;
