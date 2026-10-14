-- Komisi tidak lagi dipotong HPP bahan habis pakai (keputusan pemilik, sementara): settings.commission_deduct_hpp.
--   false → komisi jasa = harga (bersih/normal) × rasio; true → seperti sebelumnya (harga − HPP) × rasio.
-- Komisi dihitung live dari commission_lines → semua periode yang belum ditutup (termasuk transaksi lama) langsung ikut.
-- HPP tetap tercatat (transaction_item_costs) untuk laba kotor di laporan owner.
alter table settings add column commission_deduct_hpp boolean not null default false;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('commission_lines'::regproc) into def;
  old := def;
  def := replace(def, $a$greatest(0, coalesce(ti.commission_base, ti.net_amount) - coalesce(c.hpp, 0))$a$,
                      $a$greatest(0, coalesce(ti.commission_base, ti.net_amount) - case when st.commission_deduct_hpp then coalesce(c.hpp, 0) else 0 end)$a$);
  if def = old then raise exception 'Patch commission_lines tidak menemukan teks'; end if;
  execute def;

  select pg_get_functiondef('staff_commission_terms'::regproc) into def;
  old := def;
  def := replace(def, $a$'daily_min', s.daily_min_pay)$a$, $a$'daily_min', s.daily_min_pay, 'deduct_hpp', st.commission_deduct_hpp)$a$);
  if def = old then raise exception 'Patch staff_commission_terms tidak menemukan teks'; end if;
  execute def;
end $$;
