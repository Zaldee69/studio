-- Ukur layar jam (audit UI/UX 3 Nov: 4 dari 4 yang memilih layanan tidak sampai "time").
-- "slots" = layar pilih tanggal & jam terlihat. Selisih "service" → "slots" = pergi di layar staf,
-- "slots" → "time" = pergi di layar jam.
alter table funnel_events drop constraint funnel_events_step_check;
alter table funnel_events add constraint funnel_events_step_check
  check (step in ('landing', 'booking_open', 'service_pick', 'service', 'slots', 'time', 'booked'));

do $$
declare def text; old text;
begin
  select pg_get_functiondef('funnel_summary(timestamptz)'::regprocedure) into def;
  old := def;
  def := replace(def, $a$'service', count(*) filter (where step = 'service'),$a$,
    $a$'service', count(*) filter (where step = 'service'),
    'slots', count(*) filter (where step = 'slots'),$a$);
  if def = old then raise exception 'Patch funnel_summary tidak menemukan teks'; end if;
  execute def;
end $$;
