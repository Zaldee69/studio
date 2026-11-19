-- KEAMANAN (kritis): view sederhana (public_services, public_settings, public_staff, public_deposit_packages, team_names,
-- my_customer, staff_customer_card) dapat ditulisi (auto-updatable) dan berjalan dengan hak pemilik → RLS terlewati.
-- Dengan hak default Supabase (anon/authenticated memegang INSERT/UPDATE/DELETE), siapa pun yang punya kunci anon publik
-- bisa mengubah/menghapus baris tabel dasar (mis. harga layanan) lewat PATCH /rest/v1/public_services. Aplikasi tidak pernah
-- menulis ke view mana pun → cabut semua hak tulis pada seluruh view/materialized view di schema public.
do $$
declare v record;
begin
  for v in select c.relname from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm') loop
    execute format('revoke insert, update, delete, truncate, references, trigger on public.%I from public, anon, authenticated', v.relname);
  end loop;
end $$;

-- Catatan: view yang dibuat nanti perlu `revoke insert, update, delete, truncate, references, trigger on <view> from public, anon, authenticated` sendiri.

-- Pemicu pengecekan WA hanya untuk pg_cron (superuser); bukan RPC publik.
revoke execute on function kick_wa_health() from public, anon, authenticated;

-- Pembantu internal pemicu: tidak perlu bisa dipanggil lewat RPC (bocor daftar item transaksi bila UUID diketahui).
revoke execute on function tx_items_text(uuid) from public, anon, authenticated;
