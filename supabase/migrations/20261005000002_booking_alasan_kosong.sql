-- Booking online: kenapa tidak ada slot? get_available_slots() mengembalikan kosong untuk banyak sebab
-- (booking ditutup, layanan/staf dari tautan lama sudah tidak ada, tanggal tutup, staf izin, benar-benar penuh).
-- Dulu semuanya tampil "jam sudah penuh" — mis. tautan/tab lama berisi id layanan yang sudah dihapus → semua tanggal "penuh".
-- Fungsi ini memberi kode alasan agar pesan di layar tepat. null = memang penuh.
-- Kategori yang bisa dibooking online: punya kursi/meja aktif DAN staf aktif. Tanpa salah satunya, kategori itu
-- tidak ditawarkan sama sekali (landing & halaman booking), bukan ditampilkan lalu "penuh" di semua tanggal.
create function bookable_categories() returns setof text
language sql stable security definer set search_path = public as $$
  select c from unnest(array['barbershop', 'nail']) c
  where exists (select 1 from resources r where r.active and r.type::text = c)
    and exists (select 1 from staff s where s.active and s.category::text = c)
$$;

create function booking_unavailable_reason(p_date date, p_service_ids uuid[], p_staff_pick jsonb default '{}')
returns text language plpgsql stable security definer set search_path = public as $$
declare st settings; w record; j record;
begin
  select * into st from settings;
  if not st.online_booking_open then return 'closed'; end if;
  if coalesce(array_length(p_service_ids, 1), 0) = 0
     or exists (select 1 from unnest(p_service_ids) sid left join services s on s.id = sid
                where s.id is null or not s.active or not s.online_bookable or s.category = 'retail') then
    return 'services';
  end if;
  if exists (select 1 from services s where s.id = any (p_service_ids) and s.category::text not in (select bookable_categories())) then
    return 'capacity';
  end if;
  for j in select key, value from jsonb_each_text(coalesce(p_staff_pick, '{}')) where coalesce(value, '') <> '' loop
    if j.value !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or not exists (select 1 from staff s where s.id = j.value::uuid and s.active and s.category::text = j.key) then
      return 'staff';
    end if;
  end loop;
  if p_date < jkt_today() or p_date > jkt_today() + st.booking_max_days_ahead then return 'range'; end if;
  select * into w from day_window(p_date);
  if w is null or w.open_m is null then return 'day_closed'; end if;
  if exists (select 1 from jsonb_each_text(coalesce(p_staff_pick, '{}')) x
             join staff_time_off o on o.staff_id::text = x.value and o.status = 'approved'
             where o.start_at <= jkt(p_date, '00:00') + make_interval(mins => w.open_m)
               and o.end_at >= jkt(p_date, '00:00') + make_interval(mins => w.close_m)) then
    return 'staff_off';
  end if;
  if p_date = jkt_today() then return 'today'; end if;
  return null;
end $$;
