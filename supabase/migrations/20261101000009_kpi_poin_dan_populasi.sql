-- Audit KPI-3 & KPI-5 (1 Nov):
--  KPI-3: delta metrik persen (rasio ritel, utilisasi) dihitung dalam poin, sama dengan laporan owner (10% → 15% = +5 poin, bukan ▲50%).
--  KPI-5: rasio booking hanya dari booking yang jadwalnya sudah lewat (booking masa depan & status "booked" basi tidak ikut),
--         dan pembatalan memakai dasar tanggal jadwal seperti porsi online & no-show.
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['kpi_summary(date,date,text,uuid)',
          $a$    d := d || jsonb_build_object(k, case when coalesce((prev ->> k)::numeric, 0) = 0 then null
                                         else ((cur ->> k)::numeric - (prev ->> k)::numeric) * 100 / (prev ->> k)::numeric end);$a$,
          $a$    d := d || jsonb_build_object(k, case when k in ('retail_ratio', 'utilization_avg')
                                              then (cur ->> k)::numeric - (prev ->> k)::numeric  -- poin
                                         when coalesce((prev ->> k)::numeric, 0) = 0 then null
                                         else ((cur ->> k)::numeric - (prev ->> k)::numeric) * 100 / (prev ->> k)::numeric end);$a$],
    array['kpi_online(date,date)',
          $a$    'online_appts', (select count(*) from appointments where source = 'online' and status <> 'cancelled' and start_at >= a0 and start_at < a1),
    'all_appts', (select count(*) from appointments where status <> 'cancelled' and start_at >= a0 and start_at < a1),
    'online_created', (select count(*) from appointments where source = 'online' and created_at >= a0 and created_at < a1),
    'online_cancelled', (select count(*) from appointments where source = 'online' and status = 'cancelled' and created_at >= a0 and created_at < a1),$a$,
          $a$    -- hanya jadwal yang sudah lewat & benar-benar terjadi (datang/dilayani/selesai/bayar/tidak datang)
    'online_appts', (select count(*) from appointments where source = 'online' and status in ('arrived', 'in_service', 'completed', 'paid', 'no_show')
                     and start_at >= a0 and start_at < least(a1, now())),
    'all_appts', (select count(*) from appointments where status in ('arrived', 'in_service', 'completed', 'paid', 'no_show')
                  and start_at >= a0 and start_at < least(a1, now())),
    'online_created', (select count(*) from appointments where source = 'online' and status <> 'pending_review'
                       and start_at >= a0 and start_at < least(a1, now())),
    'online_cancelled', (select count(*) from appointments where source = 'online' and status = 'cancelled'
                         and start_at >= a0 and start_at < least(a1, now())),$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(fn::regprocedure) into def;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % (%) tidak menemukan teks', i, fn; end if;
    execute def;
  end loop;
end $$;
