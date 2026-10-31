begin;
\ir helpers.psql
select plan(1);

-- Audit SEC-3 (1 Nov): fungsi SECURITY DEFINER yang boleh dipanggil anon (pengunjung tanpa login) hanya daftar ini.
-- Fungsi baru mewarisi EXECUTE PUBLIC: fungsi tim → `revoke execute on function … from public, anon`; fungsi publik → tambahkan di sini.
select is(
  (select coalesce(array_agg(proname::text order by proname), '{}') from pg_proc p
   where pronamespace = 'public'::regnamespace and prosecdef and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('anon', p.oid, 'EXECUTE')),
  -- urut abjad. auth_role, my_customer_id, my_staff_id: dipakai aturan RLS tabel publik; track_funnel: analitik landing;
  -- sisanya: halaman booking publik
  array['auth_role', 'bookable_categories', 'booking_unavailable_reason', 'get_available_slots', 'my_customer_id', 'my_staff_id',
        'next_available_date', 'preview_booking', 'public_staff_off', 'track_funnel'],
  'hanya fungsi publik yang bisa dipanggil anon');

select * from finish();
rollback;
