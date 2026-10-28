-- Stok awal perkiraan dari daftar inventaris owner (foto 15 Okt 2026) × isi kemasan di dokumen "HPP Layanan D'Pras",
-- plus pembelian krim & minyak pijat Anjelina (nota). Angka minimal/perkiraan — dikoreksi lewat Stok Opname.
-- Tanpa "dibayar dari": bukan pembelian baru di arus kas. Aman dijalankan ulang (tidak dobel); dilewati saat db reset.
do $$
begin
  if not exists (select 1 from services) then return; end if;
  insert into stock_moves (item_id, qty, type, unit_cost, note)
    select i.id, v.qty, 'in', i.unit_cost, 'Stok awal dari daftar inventaris (perkiraan, 15 Okt 2026) — cek lewat Stok Opname'
    from (values ('Neck strip', 1000), ('Busa cukur', 350), ('Bedak leher', 150), ('Tonik rambut', 350), ('Krim creambath', 1500),
                 ('Pewarna rambut hitam', 2), ('Oksidan 20 vol', 1000), ('Oksidan 40 vol', 1000), ('Bubuk bleaching', 500),
                 ('Obat keriting & penetral', 4), ('Krim pijat Anjelina', 5000), ('Minyak pijat Anjelina', 1000)) v(name, qty)
    join inventory_items i on i.name = v.name and i.kind = 'consumable' and i.active
    where not exists (select 1 from stock_moves m where m.item_id = i.id and m.note like 'Stok awal dari daftar inventaris%');
end $$;
