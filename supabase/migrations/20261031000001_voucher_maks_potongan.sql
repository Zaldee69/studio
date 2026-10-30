-- Keputusan owner 30 Okt: voucher persen butuh batas potongan (SENKAMWA 10% maks. Rp10.000), supaya coloring/perming
-- tidak terpotong puluhan ribu. Kosong = tanpa batas (perilaku lama).
alter table vouchers add column max_discount bigint check (max_discount > 0);

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['voucher_check(text,uuid[],uuid,date)',
          $a$disc := case when v.kind = 'pct' then round(base * v.value / 10000.0) * 100 else least(v.value, base) end;$a$,
          $a$disc := least(case when v.kind = 'pct' then round(base * v.value / 10000.0) * 100 else least(v.value, base) end, coalesce(v.max_discount, base));$a$],
    array['voucher_check(text,uuid[],uuid,date)',
          $a$'label', case when v.kind = 'pct' then v.value || '%' else 'Rp' || to_char(v.value, 'FM999G999G999') end,$a$,
          -- + fmt_rp: to_char 'G' memakai koma di server ("Rp5,000" di halaman booking)
          $a$'label', case when v.kind = 'pct' then v.value || '%' else fmt_rp(v.value) end
      || case when v.max_discount is not null then ' (maks. ' || fmt_rp(v.max_discount) || ')' else '' end,$a$],
    array['checkout(jsonb)',
          $a$vdisc := case when vrow.kind = 'pct' then round(vbase * vrow.value / 10000.0) * 100 else least(vrow.value, vbase) end;$a$,
          $a$vdisc := least(case when vrow.kind = 'pct' then round(vbase * vrow.value / 10000.0) * 100 else least(vrow.value, vbase) end, coalesce(vrow.max_discount, vbase));$a$],
    array['alert_voucher()',
          $a$(new.kind, new.value, new.quota, new.min_spend, new.active, new.starts_on, new.ends_on, new.weekdays)$a$,
          $a$(new.kind, new.value, new.max_discount, new.quota, new.min_spend, new.active, new.starts_on, new.ends_on, new.weekdays)$a$],
    array['alert_voucher()',
          $a$(old.kind, old.value, old.quota, old.min_spend, old.active, old.starts_on, old.ends_on, old.weekdays)$a$,
          $a$(old.kind, old.value, old.max_discount, old.quota, old.min_spend, old.active, old.starts_on, old.ends_on, old.weekdays)$a$],
    array['alert_voucher()',
          $a$case when new.kind = 'pct' then new.value || '%' else fmt_rp(new.value) end,$a$,
          $a$case when new.kind = 'pct' then new.value || '%' else fmt_rp(new.value) end
      || case when new.max_discount is not null then ' (maks. ' || fmt_rp(new.max_discount) || ')' else '' end,$a$]
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
