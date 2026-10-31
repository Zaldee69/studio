-- Audit SEC-3 & SEC-4 (1 Nov): 51 fungsi SECURITY DEFINER bisa dipanggil anon (pengunjung tanpa login) lewat API. Aman hari
-- ini karena cek peran di dalamnya, tetapi satu fungsi baru yang lupa require_role langsung terbuka untuk publik.
--  1. Cabut EXECUTE anon (+ PUBLIC, sumber warisannya) dari fungsi tim & internal; hak authenticated/service_role dipertahankan.
--  2. Fungsi baru tetap mewarisi EXECUTE PUBLIC (default per-schema Postgres tidak bisa mencabutnya; global akan ikut
--     memengaruhi schema lain) → penjaganya supabase/tests/64_anon_allowlist.test.sql: gagal bila ada fungsi SECURITY DEFINER
--     baru yang bisa dipanggil anon di luar daftar. Fungsi baru tim: tambahkan `revoke execute ... from public, anon`.
do $$
declare f record; auth_ok boolean;
begin
  for f in
    select p.oid, p.oid::regprocedure as sig from pg_proc p
    where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')
      and p.prorettype <> 'trigger'::regtype
      and ((p.prosecdef and p.prosrc like '%require_role(%')
           or p.proname in ('tx_items_text', 'cash_summary', 'staff_commission_terms', 'staff_customer_history', 'time_off_conflicts',
                            'save_push_subscription', 'actor_name'))
  loop
    auth_ok := has_function_privilege('authenticated', f.oid, 'EXECUTE');
    execute format('revoke execute on function %s from public, anon', f.sig);
    if auth_ok then execute format('grant execute on function %s to authenticated', f.sig); end if;
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;

