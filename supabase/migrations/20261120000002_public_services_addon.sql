-- Booking online memisahkan layanan utama & tambahan: view publik membawa is_addon (kolom baru di akhir).
-- "Tambah waktu ..." ikut ditandai tambahan (perpanjangan layanan utama, bukan layanan sendiri).
create or replace view public_services as
  select id, name, category, price, duration_min, needs_pedicure, upsell_service_id, sort, online_bookable, public_description, is_addon
  from services where active;
update services set is_addon = true where name ilike 'Tambah waktu%' and not is_addon;
