-- Kursi terikat ke capster (manajer 13 Nov): kursi barbershop yang menjadi kursi utama capster aktif HANYA dipakai capster
-- itu, dan capster itu hanya melayani di kursinya. Saat pemiliknya libur/izin, kursinya tidak bisa dibooking.
--  • Berlaku untuk barbershop saja; meja nail & bed pijat tetap bebas (pedicure butuh kursi khusus).
--  • Kursi tanpa pemilik tetap bebas untuk capster yang belum punya kursi utama.
--  • Dijaga di DB (trigger appointments) → booking online, kasir, walk-in & ubah booking semuanya ikut.

-- Pemilik kursi barbershop (capster aktif dengan kursi utama = kursi ini).
create function chair_owner(p_resource uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select s.id from staff s join resources r on r.id = s.home_resource_id
  where s.home_resource_id = p_resource and s.active and s.category = 'barbershop' and r.type = 'barbershop'
  order by s.sort limit 1
$$;

-- Satu kursi barbershop untuk satu capster aktif.
create function guard_one_chair() returns trigger language plpgsql security definer set search_path = public as $$
declare other text;
begin
  if new.active and new.category = 'barbershop' and new.home_resource_id is not null then
    select name into other from staff
    where id <> new.id and active and category = 'barbershop' and home_resource_id = new.home_resource_id limit 1;
    if other is not null then raise exception 'Kursi ini sudah menjadi kursi %', other; end if;
  end if;
  return new;
end $$;
create trigger staff_one_chair before insert or update of home_resource_id, active, category on staff
  for each row execute function guard_one_chair();

-- Booking: kursi milik capster X hanya untuk X; capster berkursi hanya di kursinya; pemilik libur/izin → kursi tidak aktif.
-- Nama trigger diawali z_ agar jalan setelah appointments_end_at (end_at sudah dihitung).
create function guard_bound_chair() returns trigger language plpgsql security definer set search_path = public as $$
declare owner uuid; home uuid; chair text; nm text;
begin
  if new.status in ('cancelled', 'no_show', 'completed', 'paid') then return new; end if;
  if tg_op = 'UPDATE' and new.staff_id is not distinct from old.staff_id and new.resource_id is not distinct from old.resource_id
     and new.start_at = old.start_at and new.end_at = old.end_at then return new; end if;

  owner := chair_owner(new.resource_id);
  select name into chair from resources where id = new.resource_id;
  if owner is not null then
    if new.staff_id is null then new.staff_id := owner;  -- kursi bertuan: booking tanpa capster otomatis ke pemiliknya
    elsif new.staff_id <> owner then
      raise exception '% khusus untuk %', chair, (select name from staff where id = owner);
    end if;
    if exists (select 1 from staff_time_off o where o.staff_id = owner and o.status = 'approved'
               and o.start_at < new.end_at and o.end_at > new.start_at) then
      raise exception '% tidak aktif: % sedang libur/izin di jam itu', chair, (select name from staff where id = owner);
    end if;
  end if;

  select home_resource_id, name into home, nm from staff
  where id = new.staff_id and category = 'barbershop' and active and home_resource_id is not null;
  if home is not null and home <> new.resource_id then
    raise exception '% hanya melayani di %', nm, (select name from resources where id = home);
  end if;
  return new;
end $$;
create trigger appointments_z_bound_chair before insert or update on appointments
  for each row execute function guard_bound_chair();

-- Booking online: pilih capster beserta kursinya sekaligus (capster berkursi → kursinya sendiri; lainnya → kursi tanpa pemilik).
do $$
declare def text; old_block text; new_block text;
begin
  select pg_get_functiondef(oid) into def from pg_proc where proname = 'plan_booking' and pronamespace = 'public'::regnamespace;
  old_block := $o$    select s.id, s.home_resource_id into stf, home from staff s
    where s.active and s.category::text = g.cat and (pick is null or s.id = pick)$o$;
  new_block := $n$    select s.id, ch.id into stf, res from staff s
    cross join lateral (
      select r.id from resources r
      where r.active and r.type::text = g.cat
        and case when s.category = 'barbershop' and s.home_resource_id is not null then r.id = s.home_resource_id
                 else chair_owner(r.id) is null end
        and not exists (select 1 from appointments x where x.resource_id = r.id and x.status not in ('cancelled', 'no_show')
                        and (p_exclude_group is null or x.booking_group_id is distinct from p_exclude_group)
                        and x.start_at - buf < b0 and occupied_until(x) + buf > a0)
      order by (r.is_pedicure = g.pedi) desc, (r.id = s.home_resource_id) desc nulls last, r.sort, r.name
      limit 1) ch
    where s.active and s.category::text = g.cat and (pick is null or s.id = pick)$n$;
  if position(old_block in def) = 0 then raise exception 'plan_booking: blok pilih staf tidak ditemukan'; end if;
  def := replace(def, old_block, new_block);

  old_block := $o$    if stf is null then return null; end if;

    select r.id into res from resources r
    where r.active and r.type::text = g.cat
      and not exists (select 1 from appointments x where x.resource_id = r.id and x.status not in ('cancelled', 'no_show')
                      and (p_exclude_group is null or x.booking_group_id is distinct from p_exclude_group)
                      and x.start_at - buf < b0 and occupied_until(x) + buf > a0)
    order by (r.is_pedicure = g.pedi) desc, (r.id = home) desc nulls last, r.sort, r.name
    limit 1;
    if res is null then return null; end if;$o$;
  if position(old_block in def) = 0 then raise exception 'plan_booking: blok pilih kursi tidak ditemukan'; end if;
  def := replace(def, old_block, '    if stf is null then return null; end if;');
  execute def;
end $$;

revoke execute on function chair_owner(uuid) from public, anon;
grant execute on function chair_owner(uuid) to authenticated, service_role;
