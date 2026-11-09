-- Audit menu 10 Nov: modul yang belum pernah dipakai (data prod 30 hari: 0 baris) disembunyikan dari menu & tab,
-- tidak dihapus. Manajer menyalakannya lagi di Pengaturan → Profil studio → "Fitur yang ditampilkan".
--   sop      = SOP & Kepatuhan (menu manajer, SOP di HP capster, tab Pengaturan → SOP) — sop_logs/approvals 0
--   gaya     = Katalog & konsultasi gaya (HP capster, Pengaturan → Katalog gaya) — hair_consults 0
--   stasiun  = Stasiun & PIN — station_devices/staff_pins 0
--   deposit  = Paket deposit — deposit_topups 0
--   pemasok  = tab Pemasok di Inventaris — suppliers 0
--   evaluasi = tab Evaluasi tahunan di SDM — staff_review_notes 0
alter table settings add column hidden_features text[] not null default '{sop,gaya,stasiun,deposit,pemasok,evaluasi}'
  check (hidden_features <@ array['sop', 'gaya', 'stasiun', 'deposit', 'pemasok', 'evaluasi']);
comment on column settings.hidden_features is 'Modul yang disembunyikan dari menu/tab (datanya tetap). Diatur di Pengaturan → Profil studio.';

-- dibaca semua peran yang login (menu capster ikut menyesuaikan); settings sendiri hanya terbaca manajer
create function hidden_features() returns text[]
language sql stable security definer set search_path = public as $$ select hidden_features from settings $$;
revoke execute on function hidden_features() from public, anon;
grant execute on function hidden_features() to authenticated;
