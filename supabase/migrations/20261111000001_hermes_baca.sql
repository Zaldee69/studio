-- Hermes (agen manajemen D'Pras di VPS, 11 Nov) membaca prod lewat MCP Supabase mode read_only, yang menjalankan SQL sebagai
-- supabase_read_only_user. Peran itu bisa SELECT tabel, tetapi tidak bisa EXECUTE fungsi laporan (komisi, kas, laporan owner,
-- progres mingguan) karena izinnya hanya untuk authenticated. Diberikan EXECUTE hanya pada fungsi public yang STABLE/IMMUTABLE:
-- fungsi non-volatile tidak bisa INSERT/UPDATE/DELETE (Postgres menolaknya), jadi tidak membuka jalan menulis.
-- Fungsi yang memeriksa peran (require_role) tetap butuh klaim manajer lewat set_config (pola dpras-bisnis queries.md §4).
do $$
declare f regprocedure;
begin
  if not exists (select 1 from pg_roles where rolname = 'supabase_read_only_user') then
    raise notice 'supabase_read_only_user tidak ada (DB lokal?) — dilewati';
    return;
  end if;
  for f in select p.oid::regprocedure from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.provolatile in ('s', 'i')
  loop
    execute format('grant execute on function %s to supabase_read_only_user', f);
  end loop;
end $$;
