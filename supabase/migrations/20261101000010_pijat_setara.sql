-- Audit KPI-6 (1 Nov): pijat (±41% omzet) setara di analitik — penggerak AOV, insight AOV di bawah target, target AOV pijat.
alter table settings add column aov_target_massage bigint not null default 0 check (aov_target_massage >= 0);
comment on column settings.aov_target_massage is 'Target AOV pijat (Rp); 0 = belum ada target (tanpa chip & insight).';

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['kpi_aov_drivers(date,date,text,uuid)', $a$from unnest(array['service', 'barbershop', 'nail']) c(cat)$a$, $a$from unnest(array['service', 'barbershop', 'nail', 'massage']) c(cat)$a$],
    array['kpi_aov_drivers(date,date,text,uuid)', $a$order by array_position(array['service', 'barbershop', 'nail'], c.cat)$a$, $a$order by array_position(array['service', 'barbershop', 'nail', 'massage'], c.cat)$a$],
    array['kpi_insights(date,date,text,uuid)', $a$foreach cat in array array['barbershop', 'nail'] loop$a$, $a$foreach cat in array array['barbershop', 'nail', 'massage'] loop$a$],
    array['kpi_insights(date,date,text,uuid)',
          $a$target := case cat when 'barbershop' then st.aov_target_barbershop else st.aov_target_nail end;$a$,
          $a$target := case cat when 'barbershop' then st.aov_target_barbershop when 'massage' then st.aov_target_massage else st.aov_target_nail end;$a$],
    array['kpi_insights(date,date,text,uuid)',
          $a$          case cat when 'barbershop' then 'Barbershop' else 'Nail' end, pct1((target - aovv) * 100 / target),
          case cat when 'barbershop' then 'Barbershop' else 'Nail' end, pct1(coalesce(up_rate, 0)),$a$,
          $a$          case cat when 'barbershop' then 'Barbershop' when 'massage' then 'Pijat' else 'Nail' end, pct1((target - aovv) * 100 / target),
          case cat when 'barbershop' then 'Barbershop' when 'massage' then 'Pijat' else 'Nail' end, pct1(coalesce(up_rate, 0)),$a$],
    array['kpi_summary(date,date,text,uuid)', $a$'aov_nail', st.aov_target_nail,$a$, $a$'aov_nail', st.aov_target_nail, 'aov_massage', st.aov_target_massage,$a$],
    array['owner_report(date,date,date,date,date,date)', $a$'aov_nail', st.aov_target_nail, 'utilization'$a$, $a$'aov_nail', st.aov_target_nail, 'aov_massage', st.aov_target_massage, 'utilization'$a$]
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
