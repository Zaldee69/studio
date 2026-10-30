-- Bahan harian dari produk ritel (keputusan owner 30 Okt 2026): produk yang dijual juga dipakai capster di kursi.
--   • Tonik harian → Hair tonic Barber Daily (Makarizo), untuk Fresh/Relax/Signature Groom & Scalp Refresh
--   • Clay Fresh Groom ke atas → Clay Napoleon Anchor; Essential Cut & Kids Cut tetap Clay Gatsby
-- Merek milik barbershop kompetitor tidak dipakai. Harga pokok awal = taksiran harga eceran
-- (Barber Daily ±Rp74.000/140 ml, Napoleon ±Rp85.000/100 g); berubah sendiri saat Stok masuk dicatat dengan harga nota.
-- Tanpa stok awal: dicatat lewat Stok masuk setelah barang datang. Aman dijalankan ulang.
do $$
begin
  if not exists (select 1 from services) then return; end if;
  insert into inventory_items (name, kind, unit, unit_cost, reorder_at)
  select v.name, 'consumable', v.unit, v.cost, v.reorder
  from (values ('Hair tonic Barber Daily', 'ml', 530, 140), ('Clay Napoleon', 'g', 850, 50)) v(name, unit, cost, reorder)
  where not exists (select 1 from inventory_items i where i.name = v.name);

  update service_materials sm set item_id = (select id from inventory_items where name = 'Hair tonic Barber Daily')
  from services s, inventory_items i
  where s.id = sm.service_id and i.id = sm.item_id and i.name = 'Tonik rambut'
    and s.name in ('Fresh Groom', 'Relax Groom', 'Signature Groom', 'Scalp Refresh');

  update service_materials sm set item_id = (select id from inventory_items where name = 'Clay Napoleon')
  from services s, inventory_items i
  where s.id = sm.service_id and i.id = sm.item_id and i.name = 'Clay Gatsby'
    and s.name in ('Fresh Groom', 'Relax Groom', 'Signature Groom');
end $$;
