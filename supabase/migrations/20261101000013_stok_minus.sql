-- Audit KPI-14 (1 Nov): stok minus tersembunyi (laporan pakai greatest(stok, 0); alert hanya untuk bahan ber-ambang).
-- Prod 1 Nov: 5 bahan minus (pisau, sampo, clay, alas pijat, kapas) — dipakai resep tapi stok masuknya tidak pernah dicatat.
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['owner_inventory(date,date)',
          $a$    select i.kind, i.unit_cost, i.reorder_at, i.active,$a$,
          $a$    select i.name, i.unit, i.kind, i.unit_cost, i.reorder_at, i.active,$a$],
    array['owner_inventory(date,date)',
          $a$    'low_stock_now', count(*) filter (where active and reorder_at > 0 and stock_now <= reorder_at),$a$,
          $a$    'low_stock_now', count(*) filter (where active and reorder_at > 0 and stock_now <= reorder_at),
    'negative_now', count(*) filter (where active and stock_now < 0),
    'negative_items', coalesce(string_agg(name || ' ' || trim_scale(stock_now) || ' ' || unit, ', ' order by name) filter (where active and stock_now < 0), ''),$a$],
    array['alert_low_stock()',
          $a$  if lines is not null then$a$,
          $a$  -- stok minus: pemakaian tercatat tapi stok masuk belum (semua bahan aktif, termasuk tanpa ambang)
  perform safe_alert(E'⚠️ Stok minus (dipakai tapi stok masuk belum dicatat):\n' || x || E'\nCatat Inventaris → Terima stok saat beli, atau hitung ulang lewat Opname.')
  from (select string_agg(format('• %s: %s %s', name, trim_scale(qty), unit), E'\n' order by name) as x
        from stock_levels where active and qty < 0) n where n.x is not null;
  if lines is not null then$a$]
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
