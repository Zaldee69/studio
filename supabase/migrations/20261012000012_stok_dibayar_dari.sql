-- Stok masuk mencatat "dibayar dari" (laci / kas toko / rekening bank termasuk dana QRIS), seperti Pengeluaran:
--   • dari laci → mengurangi kas diharapkan di tutup kasir (tidak bisa setelah kasir hari itu ditutup);
--   • semua pembelian stok tampil di arus kas laporan owner ("Keluar: pembelian stok").
-- Biaya tetap masuk laporan laba/rugi lewat HPP saat bahan terpakai — bukan Pengeluaran (tidak dobel).
-- Data lama: paid_from kosong (belum dicatat).

alter table stock_moves add column paid_from text check (paid_from in ('laci', 'kas_toko', 'transfer')),
  add constraint stock_moves_paid_from_in check (paid_from is null or type = 'in');

drop function receive_stock(uuid, numeric, numeric, uuid, text, text, text);
create function receive_stock(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_supplier_id uuid default null,
  p_invoice_no text default null, p_note text default null, p_attachment_path text default null, p_paid_from text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it inventory_items; old_qty numeric; cost numeric;
begin
  perform require_role('manager');
  if coalesce(p_qty, 0) <= 0 then raise exception 'Jumlah masuk harus lebih dari 0'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga beli per satuan wajib diisi'; end if;
  if p_paid_from is null or p_paid_from not in ('laci', 'kas_toko', 'transfer') then raise exception 'Pilih dibayar dari (laci / kas toko / rekening)'; end if;
  if p_paid_from = 'laci' and exists (select 1 from cash_closings where date = jkt_today()) then
    raise exception 'Kasir hari ini sudah ditutup — pembelian dari laci tidak bisa dicatat lagi';
  end if;
  select * into it from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Item tidak ditemukan'; end if;
  old_qty := stock_of(p_item_id);
  cost := new_unit_cost((select inventory_cost_method from settings), old_qty, it.unit_cost, p_qty, p_unit_cost);
  insert into stock_moves (item_id, qty, type, unit_cost, supplier_id, invoice_no, attachment_path, note, paid_from)
  values (p_item_id, p_qty, 'in', p_unit_cost, coalesce(p_supplier_id, it.supplier_id), nullif(trim(coalesce(p_invoice_no, '')), ''),
          p_attachment_path, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Stok masuk'), p_paid_from);
  perform set_config('app.via_cost', 'on', true);
  update inventory_items set unit_cost = cost where id = p_item_id;
  perform set_config('app.via_cost', 'off', true);
  update notifications set read_at = now() where kind = 'low_stock' and read_at is null and payload ->> 'item_id' = p_item_id::text;
  return jsonb_build_object('qty_before', old_qty, 'qty', old_qty + p_qty, 'unit_cost_before', it.unit_cost, 'unit_cost', cost);
end $$;
revoke execute on function receive_stock(uuid, numeric, numeric, uuid, text, text, text, text) from public, anon;

-- Arus tunai laci per hari (saldo laci berjalan) ikut dikurangi pembelian stok dari laci.
create or replace function cash_day_net(p_date date) returns bigint language sql stable security definer set search_path = public as $$
  with b as (select jkt(p_date, '00:00') as t0, jkt(p_date + 1, '00:00') as t1)
  select (coalesce((select sum(paid_amount) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null
                     and payment_method in ('cash', 'deposit_cash')), 0)
        + coalesce((select sum(amount_paid) from deposit_topups, b where created_at >= t0 and created_at < t1 and method = 'cash'), 0)
        - coalesce((select sum(amount) from expenses where date = p_date and source = 'laci' and voided_at is null), 0)
        - coalesce((select sum(tip_amount) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null), 0)
        - coalesce((select sum(round(qty * unit_cost)) from stock_moves, b where created_at >= t0 and created_at < t1
                     and type = 'in' and paid_from = 'laci'), 0))::bigint
$$;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['cash_summary_full', $a$       ex as (select * from expenses where date = p_date and source = 'laci' and voided_at is null)$a$,
          $a$       ex as (select * from expenses where date = p_date and source = 'laci' and voided_at is null),
       sm as (select round(qty * unit_cost)::bigint as amount from stock_moves where type = 'in' and paid_from = 'laci' and created_at >= t0 and created_at < t1)$a$],
    array['cash_summary_full', $a$    'expense_count', (select count(*) from ex),$a$,
          $a$    'expense_count', (select count(*) from ex),
    'stock_cash', (select coalesce(sum(amount), 0) from sm),
    'stock_count', (select count(*) from sm),$a$],
    array['cash_summary_full', $a$- (r ->> 'tip_qris')::bigint)$a$, $a$- (r ->> 'tip_qris')::bigint - (r ->> 'stock_cash')::bigint)$a$],
    array['owner_report_extra', $a$    'campaign_sends',$a$,
          $a$    'stock_purchases', (select coalesce(sum(round(qty * unit_cost)), 0)::bigint from stock_moves where type = 'in' and created_at >= a0 and created_at < a1),
    'campaign_sends',$a$]
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
