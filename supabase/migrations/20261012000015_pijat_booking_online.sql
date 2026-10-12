-- Pijat bisa dibooking online (sebelumnya hanya kasir/WA). Semua layanan pijat kecuali "Tambahan 1 titik bekam"
-- (ditentukan di tempat). Tetap tidak ikut diskon paket (paket = barbershop + nail); promo booking online berlaku.
create or replace function bookable_categories() returns setof text language sql stable security definer set search_path = public as $$
  select c from unnest(array['barbershop', 'nail', 'massage']) c
  where exists (select 1 from resources r where r.active and r.type::text = c)
    and exists (select 1 from staff s where s.active and s.category::text = c)
$$;

update services set online_bookable = true
where category = 'massage' and active and name <> 'Tambahan 1 titik bekam' and not online_bookable;
