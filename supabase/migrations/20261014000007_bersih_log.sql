-- Pembersihan log otomatis (paket gratis Supabase: database 500 MB). Tiap hari 03:30 WIB:
--   • riwayat eksekusi cron > 7 hari (penyumbang terbesar: job tiap menit → ±3.000 baris/hari);
--   • notifikasi yang sudah dibaca > 60 hari;
--   • funnel_events (kunjungan landing/booking) > 400 hari (analitik membandingkan tahun lalu).
-- Data bisnis & audit_log tidak disentuh.
create function purge_logs() returns jsonb language plpgsql security definer set search_path = public as $$
declare a int; b int; c int;
begin
  delete from cron.job_run_details where end_time < now() - interval '7 days';
  get diagnostics a = row_count;
  delete from notifications where read_at is not null and read_at < now() - interval '60 days';
  get diagnostics b = row_count;
  delete from funnel_events where created_at < now() - interval '400 days';
  get diagnostics c = row_count;
  return jsonb_build_object('cron_runs', a, 'notifications', b, 'funnel_events', c);
end $$;
revoke execute on function purge_logs() from public, anon, authenticated;
select cron.schedule('gb-purge-logs', '30 20 * * *', $$select public.purge_logs()$$);  -- 03:30 WIB
