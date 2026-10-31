-- Audit UANG-4 (1 Nov): persen komisi & aturan potong-HPP dibaca dari pengaturan terbaru → setiap perubahan berlaku mundur
-- ke seluruh transaksi bulan yang belum ditutup (mis. minggu 5 Okt Obay dibayar Rp987.300, hitung ulang Rp1.000.000).
-- Aturan dibekukan per item saat bayar; item lama diisi dengan aturan yang berlaku hari ini (angka komisi tidak berubah).
alter table transaction_items add column commission_pct numeric check (commission_pct between 0 and 100),
  add column commission_deduct_hpp boolean;
comment on column transaction_items.commission_pct is 'Persen komisi saat bayar (dibekukan). Null = data sebelum 1 Nov 2026 tanpa snapshot.';

-- isi item lama dengan aturan efektif saat ini (sama dengan hitungan commission_lines sebelum migrasi ini)
alter table transaction_items disable trigger transaction_items_immutable;
update transaction_items ti set
  commission_pct = case when ti.category = 'retail' then coalesce(s.retail_pct_override, st.retail_commission_pct)
                        else coalesce((select ps.commission_pct from payroll_snapshots ps join payroll_periods pp on pp.id = ps.period_id
                                       where pp.status = 'closed' and pp.month = date_trunc('month', t.created_at at time zone 'Asia/Jakarta')::date
                                         and ps.staff_id = s.id), s.commission_pct_override, st.commission_pct) end,
  commission_deduct_hpp = case when ti.category = 'retail' then false else coalesce(s.deduct_hpp, st.commission_deduct_hpp) end
from transactions t, staff s, settings st
where t.id = ti.transaction_id and s.id = ti.staff_id;
alter table transaction_items enable trigger transaction_items_immutable;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['checkout(jsonb)',
          $a$price, discount_share, net_amount, from_upsell, commission_base)$a$,
          $a$price, discount_share, net_amount, from_upsell, commission_base, commission_pct, commission_deduct_hpp)$a$],
    array['checkout(jsonb)',
          $a$            case when st.commission_basis = 'gross' then (l ->> 'price')::bigint end)
    returning id into tiid;$a$,
          $a$            case when st.commission_basis = 'gross' then (l ->> 'price')::bigint end,
            -- aturan komisi dibekukan saat bayar (perubahan aturan tidak berlaku mundur)
            (select case when (l ->> 'category') = 'retail' then coalesce(s.retail_pct_override, st.retail_commission_pct)
                         else coalesce(s.commission_pct_override, st.commission_pct) end from staff s where s.id = (l ->> 'staff_id')::uuid),
            (select case when (l ->> 'category') = 'retail' then false else coalesce(s.deduct_hpp, st.commission_deduct_hpp) end
             from staff s where s.id = (l ->> 'staff_id')::uuid))
    returning id into tiid;$a$],
    array['commission_lines(date,uuid)',
          $a$else round(greatest(0, coalesce(ti.commission_base, ti.net_amount) - case when coalesce(s.deduct_hpp, st.commission_deduct_hpp) then coalesce(c.hpp, 0) else 0 end) * p.pct / 100.0) end::bigint,$a$,
          $a$else round(greatest(0, coalesce(ti.commission_base, ti.net_amount) - case when coalesce(ti.commission_deduct_hpp, s.deduct_hpp, st.commission_deduct_hpp) then coalesce(c.hpp, 0) else 0 end) * p.pct / 100.0) end::bigint,$a$],
    array['commission_lines(date,uuid)',
          $a$    select case when ti.category = 'retail' then coalesce(s.retail_pct_override, st.retail_commission_pct)$a$,
          $a$    select case when ti.commission_pct is not null then ti.commission_pct
                when ti.category = 'retail' then coalesce(s.retail_pct_override, st.retail_commission_pct)$a$]
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
