-- Dasar komisi bisa dipilih: 'net' = harga setelah diskon (perilaku lama) atau 'gross' = harga normal (diskon/promo
-- ditanggung toko). Disimpan PER BARIS saat checkout (commission_base) → mengubah pengaturan tidak mengubah komisi
-- transaksi yang sudah terjadi. Omzet di laporan tetap harga bersih; hanya perhitungan komisi yang memakai dasar ini.

alter table settings add column commission_basis text not null default 'net' check (commission_basis in ('net', 'gross'));
alter table transaction_items add column commission_base bigint check (commission_base >= 0); -- null = harga bersih (net_amount)

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['checkout', $a$                                   price, discount_share, net_amount, from_upsell)$a$,
          $a$                                   price, discount_share, net_amount, from_upsell, commission_base)$a$],
    array['checkout', $a$            (l ->> 'price')::bigint - share, (l ->> 'from_upsell')::boolean)$a$,
          $a$            (l ->> 'price')::bigint - share, (l ->> 'from_upsell')::boolean,
            case when st.commission_basis = 'gross' then (l ->> 'price')::bigint end)$a$],
    array['commission_lines', $a$round(ti.net_amount * p.pct / 100.0)$a$, $a$round(coalesce(ti.commission_base, ti.net_amount) * p.pct / 100.0)$a$],
    array['commission_lines', $a$greatest(0, ti.net_amount - coalesce(c.hpp, 0))$a$, $a$greatest(0, coalesce(ti.commission_base, ti.net_amount) - coalesce(c.hpp, 0))$a$],
    array['staff_commission_terms', $a$'retail_pct', st.retail_commission_pct$a$, $a$'retail_pct', st.retail_commission_pct, 'basis', st.commission_basis$a$]
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
