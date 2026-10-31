-- Keputusan owner 1 Nov 2026: fitur jaring pengaman bulanan dihapus (sejak 25 Okt gaji bulanan tidak dipakai; staf dibayar
-- komisi mingguan). Jaring harian per staf (staff.daily_min_pay, mis. Obay) dan gaji pokok (staff.base_salary) tetap.
-- ponytail: kolom settings.min_monthly_pay dibiarkan (0, tidak dipakai) — hapus bila alert_settings & tipe dibersihkan.
update settings set min_monthly_pay = 0;
comment on column settings.min_monthly_pay is 'TIDAK DIPAKAI sejak 1 Nov 2026 (jaring bulanan dihapus).';

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['commission_live(date)',
          $a$else greatest(0, agg.minpay - (agg.cs + agg.cr)) end::bigint as subsidy$a$,
          $a$else 0 end::bigint as subsidy$a$],
    array['staff_commission_terms()',
          $a$case when s.base_salary is null then st.min_monthly_pay else 0 end$a$,
          $a$0$a$]
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
