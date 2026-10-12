-- Opt-out promo dihapus (keputusan pemilik): tidak ada centang "tidak mau promo" & footer promo tanpa "Balas STOP"
-- (balasan STOP tidak diproses otomatis — jangan menjanjikannya). Penerima blast = semua pelanggan ber-WA.
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['campaign_audience', $a$where c.whatsapp is not null and not c.promo_opt_out$a$, $a$where c.whatsapp is not null$a$],
    array['send_campaign', $a$ || E'\n\n— ' || shop || E'\nTidak ingin menerima info promo? Balas STOP.'$a$, $a$ || E'\n\n— ' || shop$a$],
    array['forget_customer_core', $a$, notes = '', promo_opt_out = true, deleted_at = now()$a$, $a$, notes = '', deleted_at = now()$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % #% tidak menemukan teks', fn, i; end if;
    execute def;
  end loop;
end $$;

alter table customers drop column promo_opt_out;
