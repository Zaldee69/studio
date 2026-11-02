-- Audit tumpang tindih TT-23 (1 Nov): "naik paket" punya 4 nama (Naik paket, Paket Groom, Fresh Groom ke atas, paket_groom).
-- Dibakukan "naik paket" (layanan bertanda services.is_upgrade) di rapor capster & fakta rapat AI.
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['staff_weekly_report()', $a$format('Paket Groom %s · dengan tambahan$a$, $a$format('Naik paket %s · dengan tambahan$a$],
    array['ai_weekly_facts()', $a$'paket_groom', g,$a$, $a$'naik_paket', g,$a$]
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
