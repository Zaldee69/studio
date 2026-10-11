-- Tautan Google Maps toko (pin bisnis, mis. dari tombol "Bagikan"): alamat di halaman publik & ringkasan booking mengarah ke sini.
-- Kosong = pencarian Google Maps dari teks alamat.
alter table settings add column maps_url text check (maps_url ~ '^https://');
update settings set maps_url = 'https://maps.app.goo.gl/JBx5932RvgpHNhqR9' where maps_url is null;

do $$
declare def text := pg_get_viewdef('public_settings');
begin
  def := replace(def, E'\n   FROM settings;', E',\n    maps_url\n   FROM settings;');
  if def = pg_get_viewdef('public_settings') then raise exception 'public_settings: pola FROM tidak ditemukan'; end if;
  execute 'create or replace view public_settings as ' || def;
end $$;
