-- Ukur langkah booking lebih rinci (audit UI/UX 30 Okt): "service_pick" = pelanggan mengetuk satu layanan,
-- "service" tetap = menekan Lanjut dari daftar layanan. Selisihnya menunjukkan apakah orang pergi sebelum
-- memilih apa pun, atau setelah memilih (mis. karena harga/durasi).
alter table funnel_events drop constraint funnel_events_step_check;
alter table funnel_events add constraint funnel_events_step_check
  check (step in ('landing', 'booking_open', 'service_pick', 'service', 'time', 'booked'));

do $$
declare def text; old text;
begin
  select pg_get_functiondef('funnel_summary'::regproc) into def;
  old := def;
  def := replace(def, $a$'service', count(*) filter (where step = 'service'),$a$,
    $a$'service_pick', count(*) filter (where step = 'service_pick'),
    'service', count(*) filter (where step = 'service'),$a$);
  if def = old then raise exception 'Patch funnel_summary tidak menemukan teks'; end if;
  execute def;
end $$;
