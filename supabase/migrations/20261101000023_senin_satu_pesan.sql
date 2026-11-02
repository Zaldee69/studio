-- Audit tumpang tindih TT-16 (1 Nov, keputusan owner #7): Telegram owner Senin pagi menumpuk (08.05 ringkasan angka,
-- 08.20 rapat AI) dengan isi yang sebagian sama. Sekarang satu pesan: ringkasan angka + notulen rapat AI, dikirim rute
-- /api/ai/weekly. Cadangan 09.00: bila sampai jam itu ringkasan belum masuk antrean (AI/rute gagal), kirim ringkasan saja.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('alert_weekly_summary()'::regprocedure) into def;
  old := def;
  def := replace(def, 'FUNCTION public.alert_weekly_summary()', 'FUNCTION public.weekly_summary_text()');
  def := replace(def, 'RETURNS void', 'RETURNS text');
  def := replace(def, 'perform safe_alert(format(E''📈 Ringkasan minggu', 'return format(E''📈 Ringkasan minggu');
  def := replace(def, $a$lalu bayar.' end));$a$, $a$lalu bayar.' end);$a$);
  if def = old or position('return format(' in def) = 0 or position('end);' in def) = 0 then
    raise exception 'Patch weekly_summary_text tidak menemukan teks';
  end if;
  execute def;
end $$;
revoke execute on function weekly_summary_text() from public, anon, authenticated;

create or replace function alert_weekly_summary() returns void language plpgsql security definer set search_path = public as $$
begin
  perform safe_alert(weekly_summary_text());
end $$;

-- Senin: ringkasan tidak lagi dikirim 08.05 (ikut pesan rapat AI)
do $$
declare def text; old text;
begin
  select pg_get_functiondef('alert_morning()'::regprocedure) into def;
  old := def;
  def := replace(def, $a$  if extract(isodow from jkt_today()) = 1 then perform alert_weekly_summary(); end if;
$a$, '');
  if def = old then raise exception 'Patch alert_morning tidak menemukan teks'; end if;
  execute def;
end $$;

create function weekly_summary_fallback() returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from outbound_messages where template = 'alert' and body like '📈 Ringkasan minggu%' and created_at >= jkt(jkt_today(), '00:00')) then
    perform alert_weekly_summary();
  end if;
end $$;
revoke execute on function weekly_summary_fallback() from public, anon, authenticated;
select cron.schedule('gb-ringkasan-cadangan', '0 2 * * 1', 'select public.weekly_summary_fallback()');
