-- Simpan Jam buka di prod gagal: "UPDATE requires a WHERE clause" (pg-safeupdate di jalur API). Trigger sync_grid_hours
-- meng-update settings (satu baris, id = true) tanpa WHERE. Sekalian refresh_analytics (satu baris analytics_refresh).
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['sync_grid_hours()',
          $a$close_time = coalesce((select max(close_time) from opening_hours where not closed), close_time);$a$,
          $a$close_time = coalesce((select max(close_time) from opening_hours where not closed), close_time)
  where id;$a$],
    array['refresh_analytics(boolean)', $a$update analytics_refresh set dirty = false;$a$, $a$update analytics_refresh set dirty = false where id;$a$],
    array['refresh_analytics(boolean)', $a$update analytics_refresh set refreshed_at = now();$a$, $a$update analytics_refresh set refreshed_at = now() where id;$a$]
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
