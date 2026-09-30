-- Tahap 4 (Fase 2): Inventaris & HPP · SDM & Komisi.
-- Prinsip: stok = Σ stock_moves.qty · HPP transaksi = snapshot · komisi dari satu fungsi (commission_for_period)
-- · periode gaji tertutup = final · hak akses di RLS.

-- =====================================================================================================
-- 2.1 Pengaturan
-- =====================================================================================================
alter table settings
  add column inventory_cost_method text not null default 'weighted_avg' check (inventory_cost_method in ('weighted_avg', 'last')),
  add column margin_warning_pct numeric not null default 60 check (margin_warning_pct between 0 and 100),
  add column usage_variance_threshold_pct numeric not null default 10 check (usage_variance_threshold_pct > 0),
  add column retail_commission_pct numeric not null default 0 check (retail_commission_pct between 0 and 100),
  add column reorder_suggest_multiplier numeric not null default 2 check (reorder_suggest_multiplier >= 1);

-- =====================================================================================================
-- 2.2 Pemasok · 2.3 inventory_items
-- =====================================================================================================
create table suppliers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  whatsapp text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create function suppliers_normalize() returns trigger language plpgsql as $$
begin
  new.whatsapp := case when nullif(trim(coalesce(new.whatsapp, '')), '') is null then null else normalize_wa(new.whatsapp) end;
  if new.whatsapp is null and nullif(trim(coalesce(new.whatsapp, '')), '') is not null then raise exception 'No. WhatsApp pemasok tidak valid'; end if;
  return new;
end $$;
create trigger suppliers_normalize before insert or update on suppliers for each row execute function suppliers_normalize();

alter table inventory_items
  alter column unit_cost type numeric(14,4),
  add column supplier_id uuid references suppliers (id) on delete set null,
  add column sku text,
  add column min_order_qty numeric check (min_order_qty > 0);

-- Harga pokok hanya berubah lewat receive_stock / set_unit_cost (bukan edit langsung di tabel).
create table cost_changes (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items (id),
  before numeric(14,4) not null,
  after numeric(14,4) not null,
  reason text not null,
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create function guard_unit_cost() returns trigger language plpgsql as $$
begin
  if new.unit_cost is distinct from old.unit_cost and coalesce(current_setting('app.via_cost', true), '') <> 'on' then
    raise exception 'Harga pokok hanya berubah lewat Stok masuk atau Penyesuaian harga';
  end if;
  return new;
end $$;
create trigger inventory_items_guard_cost before update on inventory_items for each row execute function guard_unit_cost();

-- Item yang punya mutasi tidak boleh dihapus (FK stock_moves sudah restrict) — pesan yang jelas:
create function guard_item_delete() returns trigger language plpgsql as $$
begin
  if exists (select 1 from stock_moves where item_id = old.id) then
    raise exception 'Item sudah punya riwayat mutasi — nonaktifkan saja';
  end if;
  return old;
end $$;
create trigger inventory_items_guard_delete before delete on inventory_items for each row execute function guard_item_delete();

-- =====================================================================================================
-- 2.4 stock_moves · 2.5 opname
-- =====================================================================================================
alter table stock_moves
  add column unit_cost numeric(14,4),
  add column supplier_id uuid references suppliers (id) on delete set null,
  add column invoice_no text,
  add column attachment_path text,
  add column reason text check (reason in ('rusak', 'kedaluwarsa', 'tumpah', 'keperluan_lain', 'koreksi'));
update stock_moves m set unit_cost = i.unit_cost from inventory_items i where i.id = m.item_id and m.type = 'in' and m.unit_cost is null;
update stock_moves set reason = 'koreksi' where type = 'adjust' and reason is null;
alter table stock_moves
  add constraint stock_moves_in_cost check (type <> 'in' or (qty > 0 and unit_cost is not null)),
  add constraint stock_moves_adjust_reason check (type <> 'adjust' or reason is not null);

alter table stock_opnames rename column counted_by to started_by;
alter table stock_opnames rename column created_at to started_at;
alter table stock_opnames
  add column status text not null default 'approved' check (status in ('draft', 'approved', 'cancelled')),
  add column scope text not null default 'all' check (scope in ('consumable', 'retail', 'all')),
  add column approved_by uuid,
  add column approved_at timestamptz;
alter table stock_opnames alter column status set default 'draft';
update stock_opnames set approved_at = started_at where status = 'approved';
create unique index stock_opnames_one_draft on stock_opnames (scope) where status = 'draft';

create table stock_opname_lines (
  opname_id uuid not null references stock_opnames (id) on delete cascade,
  item_id uuid not null references inventory_items (id),
  system_qty numeric(14,3) not null,
  counted_qty numeric(14,3) check (counted_qty >= 0),
  unit_cost numeric(14,4) not null,
  diff numeric(14,3) generated always as (counted_qty - system_qty) stored,
  counted_by uuid,
  counted_at timestamptz,
  primary key (opname_id, item_id)
);

-- =====================================================================================================
-- 2.6 Resep · 2.7 transaction_items
-- =====================================================================================================
create table recipe_changes (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  before jsonb not null,
  after jsonb not null,
  changed_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

alter table transaction_items add column from_upsell boolean not null default false;

-- =====================================================================================================
-- 2.8 Payroll
-- =====================================================================================================
create table payroll_adjustments (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id),
  month date not null check (extract(day from month) = 1),
  kind text not null check (kind in ('bonus', 'deduction', 'correction')),
  amount bigint not null check (amount <> 0),
  reason text not null check (length(trim(reason)) > 0),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (kind <> 'bonus' or amount > 0),
  check (kind <> 'deduction' or amount < 0)
);
create index payroll_adjustments_month_idx on payroll_adjustments (month, staff_id);

create table payroll_periods (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid, closed_at timestamptz,
  reopened_by uuid, reopened_at timestamptz, reopen_reason text
);

create table payroll_snapshots (
  period_id uuid not null references payroll_periods (id) on delete cascade,
  staff_id uuid not null references staff (id),
  staff_name text not null,
  category staff_category not null,
  commission_pct numeric not null,
  service_count int not null,
  revenue_net bigint not null,
  hpp_total bigint not null,
  commission_service bigint not null,
  commission_retail bigint not null,
  subsidy bigint not null,
  adjustments bigint not null,
  total_pay bigint not null,
  paid_at timestamptz,
  paid_method text check (paid_method in ('tunai', 'transfer')),
  paid_by uuid,
  note text not null default '',
  primary key (period_id, staff_id)
);

-- Catatan manajer untuk evaluasi bonus tahunan.
create table staff_review_notes (
  staff_id uuid not null references staff (id) on delete cascade,
  year int not null,
  note text not null default '',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (staff_id, year)
);

-- =====================================================================================================
-- 2.9 Notifikasi
-- =====================================================================================================
create table notifications (
  id uuid primary key default gen_random_uuid(),
  target_role app_role not null check (target_role in ('manager', 'cashier', 'staff')),
  target_user uuid references auth.users (id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}',
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_unread_idx on notifications (target_role, created_at desc) where read_at is null;
alter publication supabase_realtime add table notifications, stock_opnames, stock_opname_lines, payroll_periods, payroll_snapshots;

create function notify(p_role app_role, p_kind text, p_payload jsonb, p_user uuid default null) returns void
language sql security definer set search_path = public as $$
  insert into notifications (target_role, target_user, kind, payload) values (p_role, p_user, p_kind, p_payload)
$$;

-- Stok melewati ambang reorder (sebelumnya > ambang, sekarang ≤ ambang) → notifikasi manajer, sekali per item
-- selama notifikasi sebelumnya belum dibaca. Dipasang di stock_moves agar checkout, penyesuaian, & opname sama.
create function stock_cross_reorder() returns trigger language plpgsql security definer set search_path = public as $$
declare it inventory_items; now_qty numeric;
begin
  select * into it from inventory_items where id = new.item_id;
  if not it.active or new.qty >= 0 then return null; end if;
  select coalesce(sum(qty), 0) into now_qty from stock_moves where item_id = new.item_id;
  if now_qty - new.qty > it.reorder_at and now_qty <= it.reorder_at
     and not exists (select 1 from notifications where kind = 'low_stock' and read_at is null and payload ->> 'item_id' = it.id::text) then
    perform notify('manager', 'low_stock', jsonb_build_object('item_id', it.id, 'name', it.name, 'qty', now_qty,
                                                              'reorder_at', it.reorder_at, 'unit', it.unit));
  end if;
  return null;
end $$;
create trigger stock_moves_cross_reorder after insert on stock_moves for each row execute function stock_cross_reorder();

create function mark_notifications_read(p_ids uuid[] default null) returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where read_at is null and (p_ids is null or id = any (p_ids))
    and (target_user = auth.uid() or (target_user is null and target_role = auth_role()))
$$;

-- =====================================================================================================
-- RLS
-- =====================================================================================================
alter table suppliers enable row level security;
alter table cost_changes enable row level security;
alter table stock_opname_lines enable row level security;
alter table recipe_changes enable row level security;
alter table payroll_adjustments enable row level security;
alter table payroll_periods enable row level security;
alter table payroll_snapshots enable row level security;
alter table staff_review_notes enable row level security;
alter table notifications enable row level security;

create policy manager_all on suppliers for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
create policy manager_read on cost_changes for select to authenticated using (auth_role() = 'manager');
create policy manager_read on stock_opname_lines for select to authenticated using (auth_role() = 'manager');
create policy manager_read on recipe_changes for select to authenticated using (auth_role() = 'manager');
create policy manager_read on payroll_adjustments for select to authenticated using (auth_role() = 'manager');
create policy staff_own on payroll_adjustments for select to authenticated using (auth_role() = 'staff' and staff_id = my_staff_id());
create policy team_read on payroll_periods for select to authenticated using (auth_role() in ('manager', 'staff'));
create policy manager_read on payroll_snapshots for select to authenticated using (auth_role() = 'manager');
create policy staff_own on payroll_snapshots for select to authenticated using (auth_role() = 'staff' and staff_id = my_staff_id());
create policy manager_all on staff_review_notes for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
create policy own_read on notifications for select to authenticated
  using (target_user = auth.uid() or (target_user is null and target_role = auth_role()));
-- Kasir melihat daftar sesi opname (tanpa harga); mutasi hanya lewat RPC.
create policy cashier_read on stock_opnames for select to authenticated using (auth_role() = 'cashier');
drop policy manager_in on stock_moves;

-- Kasir: nama/satuan/stok tanpa harga pokok. View milik postgres (bukan security_invoker) + filter peran.
create view inventory_public as
  select i.id, i.name, i.kind, i.unit, i.reorder_at, i.active, coalesce(sum(m.qty), 0) as qty
  from inventory_items i left join stock_moves m on m.item_id = i.id
  where auth_role() in ('manager', 'cashier')
  group by i.id;
create view opname_sheet as
  select l.opname_id, l.item_id, i.name, i.kind, i.unit, l.system_qty, l.counted_qty, l.diff, l.counted_at
  from stock_opname_lines l join inventory_items i on i.id = l.item_id
  where auth_role() in ('manager', 'cashier');
grant select on inventory_public, opname_sheet to authenticated;

-- stock_levels: tambah harga pokok & nilai (tetap security_invoker → hanya manajer).
drop view stock_levels;
create view stock_levels with (security_invoker = true) as
  select i.id as item_id, i.name, i.kind, i.unit, i.reorder_at, i.unit_cost, i.supplier_id, i.active,
         coalesce(sum(m.qty), 0) as qty,
         round(coalesce(sum(m.qty), 0) * i.unit_cost)::bigint as stock_value,
         case when coalesce(sum(m.qty), 0) <= i.reorder_at then 'reorder'
              when coalesce(sum(m.qty), 0) <= i.reorder_at * 1.5 then 'low'
              else 'ok' end as status
  from inventory_items i left join stock_moves m on m.item_id = i.id
  group by i.id;

-- Storage nota pembelian (privat, manajer).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;
create policy receipts_manager_read on storage.objects for select to authenticated using (bucket_id = 'receipts' and auth_role() = 'manager');
create policy receipts_manager_write on storage.objects for insert to authenticated with check (bucket_id = 'receipts' and auth_role() = 'manager');

-- =====================================================================================================
-- 3. Fungsi inventaris
-- =====================================================================================================
create function stock_of(p_item uuid) returns numeric language sql stable security definer set search_path = public as $$
  select coalesce(sum(qty), 0) from stock_moves where item_id = p_item
$$;

-- 4.1 Harga pokok baru saat stok masuk.
create function new_unit_cost(p_method text, p_old_qty numeric, p_old_cost numeric, p_qty numeric, p_cost numeric)
returns numeric language sql immutable as $$
  select round(case when p_method = 'last' or p_old_qty <= 0 then p_cost
                    else (p_old_qty * p_old_cost + p_qty * p_cost) / (p_old_qty + p_qty) end, 4)
$$;

create function receive_stock(p_item_id uuid, p_qty numeric, p_unit_cost numeric, p_supplier_id uuid default null,
                              p_invoice_no text default null, p_note text default null, p_attachment_path text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare it inventory_items; old_qty numeric; cost numeric;
begin
  perform require_role('manager');
  if coalesce(p_qty, 0) <= 0 then raise exception 'Jumlah masuk harus lebih dari 0'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga beli per satuan wajib diisi'; end if;
  select * into it from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Item tidak ditemukan'; end if;
  old_qty := stock_of(p_item_id);
  cost := new_unit_cost((select inventory_cost_method from settings), old_qty, it.unit_cost, p_qty, p_unit_cost);
  insert into stock_moves (item_id, qty, type, unit_cost, supplier_id, invoice_no, attachment_path, note)
  values (p_item_id, p_qty, 'in', p_unit_cost, coalesce(p_supplier_id, it.supplier_id), nullif(trim(coalesce(p_invoice_no, '')), ''),
          p_attachment_path, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Stok masuk'));
  perform set_config('app.via_cost', 'on', true);
  update inventory_items set unit_cost = cost where id = p_item_id;
  perform set_config('app.via_cost', 'off', true);
  update notifications set read_at = now() where kind = 'low_stock' and read_at is null and payload ->> 'item_id' = p_item_id::text;
  return jsonb_build_object('qty_before', old_qty, 'qty', old_qty + p_qty, 'unit_cost_before', it.unit_cost, 'unit_cost', cost);
end $$;

create function adjust_stock(p_item_id uuid, p_qty numeric, p_reason text, p_note text default null) returns numeric
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if coalesce(p_qty, 0) = 0 then raise exception 'Jumlah penyesuaian tidak boleh 0'; end if;
  if p_reason is null or p_reason not in ('rusak', 'kedaluwarsa', 'tumpah', 'keperluan_lain', 'koreksi') then
    raise exception 'Pilih alasan penyesuaian';
  end if;
  if not exists (select 1 from inventory_items where id = p_item_id) then raise exception 'Item tidak ditemukan'; end if;
  insert into stock_moves (item_id, qty, type, reason, note)
  values (p_item_id, p_qty, 'adjust', p_reason, coalesce(nullif(trim(coalesce(p_note, '')), ''), 'Penyesuaian'));
  return stock_of(p_item_id);
end $$;

-- Penyesuaian harga pokok khusus manajer (mis. salah input) — tercatat di cost_changes dengan alasan.
create function set_unit_cost(p_item_id uuid, p_unit_cost numeric, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare old numeric;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan wajib diisi'; end if;
  if p_unit_cost is null or p_unit_cost < 0 then raise exception 'Harga pokok tidak valid'; end if;
  select unit_cost into old from inventory_items where id = p_item_id for update;
  if not found then raise exception 'Item tidak ditemukan'; end if;
  perform set_config('app.via_cost', 'on', true);
  update inventory_items set unit_cost = round(p_unit_cost, 4) where id = p_item_id;
  perform set_config('app.via_cost', 'off', true);
  insert into cost_changes (item_id, before, after, reason) values (p_item_id, old, round(p_unit_cost, 4), trim(p_reason));
end $$;

-- lines: [{item_id, qty}] — mengganti seluruh resep, riwayat before/after tersimpan.
create function save_recipe(p_service_id uuid, p_lines jsonb) returns bigint
language plpgsql security definer set search_path = public as $$
declare b jsonb; a jsonb;
begin
  perform require_role('manager');
  if not exists (select 1 from services where id = p_service_id and category <> 'retail') then raise exception 'Layanan tidak ditemukan'; end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_lines, '[]')) x(item_id uuid, qty numeric) where x.qty is null or x.qty <= 0) then
    raise exception 'Jumlah pakai harus lebih dari 0';
  end if;
  if exists (select 1 from jsonb_to_recordset(coalesce(p_lines, '[]')) x(item_id uuid, qty numeric)
             left join inventory_items i on i.id = x.item_id where i.id is null or i.kind <> 'consumable') then
    raise exception 'Bahan harus item HPP';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', sm.item_id, 'name', i.name, 'qty', sm.qty, 'unit', i.unit) order by i.name), '[]')
  into b from service_materials sm join inventory_items i on i.id = sm.item_id where sm.service_id = p_service_id;
  delete from service_materials where service_id = p_service_id;
  insert into service_materials (service_id, item_id, qty)
  select p_service_id, x.item_id, sum(x.qty) from jsonb_to_recordset(coalesce(p_lines, '[]')) x(item_id uuid, qty numeric) group by x.item_id;
  select coalesce(jsonb_agg(jsonb_build_object('item_id', sm.item_id, 'name', i.name, 'qty', sm.qty, 'unit', i.unit) order by i.name), '[]')
  into a from service_materials sm join inventory_items i on i.id = sm.item_id where sm.service_id = p_service_id;
  if a is distinct from b then insert into recipe_changes (service_id, before, after) values (p_service_id, b, a); end if;
  return service_hpp(p_service_id);
end $$;

-- Margin semua layanan (4.2). security_invoker → hanya manajer (service_materials & inventory_items).
create view service_margins with (security_invoker = true) as
  with h as (
    select s.id, s.name, s.category, s.price, s.active,
           coalesce(round(sum(sm.qty * i.unit_cost)), 0)::bigint as hpp
    from services s
    left join service_materials sm on sm.service_id = s.id
    left join inventory_items i on i.id = sm.item_id
    where s.category <> 'retail'
    group by s.id
  )
  select h.*, h.price - h.hpp as margin,
         case when h.price > 0 then round((h.price - h.hpp) * 100.0 / h.price, 1) else 0 end as margin_pct,
         round(greatest(0, h.price - h.hpp) * st.commission_pct / 100.0)::bigint as commission,
         h.price - h.hpp - round(greatest(0, h.price - h.hpp) * st.commission_pct / 100.0)::bigint as contribution
  from h, settings st;

-- ---------- Stok opname ----------
create function opname_start(p_scope text) returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  perform require_role('manager', 'cashier');
  if p_scope not in ('consumable', 'retail', 'all') then raise exception 'Cakupan opname tidak valid'; end if;
  if exists (select 1 from stock_opnames where scope = p_scope and status = 'draft') then
    raise exception 'Masih ada opname draft untuk cakupan ini — lanjutkan atau batalkan dulu';
  end if;
  insert into stock_opnames (scope, status, note) values (p_scope, 'draft', '') returning id into oid;
  insert into stock_opname_lines (opname_id, item_id, system_qty, unit_cost)
  select oid, i.id, stock_of(i.id), i.unit_cost from inventory_items i
  where i.active and (p_scope = 'all' or i.kind::text = p_scope);
  perform notify('manager', 'opname_pending', jsonb_build_object('opname_id', oid, 'scope', p_scope));
  return oid;
end $$;

-- lines: [{item_id, counted_qty (null = belum dihitung)}] — boleh sebagian.
create function opname_save_counts(p_opname_id uuid, p_lines jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  perform require_role('manager', 'cashier');
  perform 1 from stock_opnames where id = p_opname_id and status = 'draft' for update;
  if not found then raise exception 'Opname tidak ditemukan atau sudah dikunci'; end if;
  update stock_opname_lines l set counted_qty = x.counted_qty, counted_by = auth.uid(), counted_at = now()
  from jsonb_to_recordset(coalesce(p_lines, '[]')) x(item_id uuid, counted_qty numeric)
  where l.opname_id = p_opname_id and l.item_id = x.item_id and l.counted_qty is distinct from x.counted_qty;
  get diagnostics n = row_count;
  return n;
end $$;

-- 4.4: mutasi 'opname' sebesar diff untuk tiap baris terhitung dengan diff ≠ 0. Baris kosong dilewati.
create function opname_approve(p_opname_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int; v bigint;
begin
  perform require_role('manager');
  perform 1 from stock_opnames where id = p_opname_id and status = 'draft' for update;
  if not found then raise exception 'Opname tidak ditemukan atau sudah dikunci'; end if;
  insert into stock_moves (item_id, qty, type, opname_id, unit_cost, note)
  select item_id, diff, 'opname', p_opname_id, unit_cost, 'Stok opname'
  from stock_opname_lines where opname_id = p_opname_id and counted_qty is not null and diff <> 0;
  get diagnostics n = row_count;
  select coalesce(round(sum(diff * unit_cost)), 0) into v from stock_opname_lines where opname_id = p_opname_id and counted_qty is not null;
  update stock_opnames set status = 'approved', approved_by = auth.uid(), approved_at = now() where id = p_opname_id;
  update notifications set read_at = now() where kind = 'opname_pending' and read_at is null and payload ->> 'opname_id' = p_opname_id::text;
  return jsonb_build_object('moves', n, 'value', v);
end $$;

create function opname_cancel(p_opname_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  update stock_opnames set status = 'cancelled' where id = p_opname_id and status = 'draft';
  if not found then raise exception 'Opname tidak ditemukan atau sudah dikunci'; end if;
  update notifications set read_at = now() where kind = 'opname_pending' and read_at is null and payload ->> 'opname_id' = p_opname_id::text;
end $$;

drop function save_stock_opname(jsonb, text);

-- 4.5 Pemakaian teoretis vs aktual antara dua opname yang disetujui (per bahan yang ada di kedua opname).
-- Batas waktu = saat opname dimulai (snapshot system_qty). Transaksi void (pemakaian + pembalik) diabaikan.
create function usage_report(p_from_opname uuid, p_to_opname uuid)
returns table (item_id uuid, name text, unit text, unit_cost numeric, theoretical numeric, actual numeric,
               variance numeric, variance_pct numeric, variance_value bigint, flagged boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare o1 stock_opnames; o2 stock_opnames; tmp stock_opnames; thr numeric := (select usage_variance_threshold_pct from settings);
begin
  perform require_role('manager');
  select * into o1 from stock_opnames where id = p_from_opname and status = 'approved';
  select * into o2 from stock_opnames where id = p_to_opname and status = 'approved';
  if o1.id is null or o2.id is null then raise exception 'Pilih dua opname yang sudah disetujui'; end if;
  if o1.started_at >= o2.started_at then tmp := o1; o1 := o2; o2 := tmp; end if;
  return query
  with lines as (
    select a.item_id, coalesce(a.counted_qty, a.system_qty) as q0, coalesce(b.counted_qty, b.system_qty) as q1
    from stock_opname_lines a join stock_opname_lines b on b.item_id = a.item_id and b.opname_id = o2.id
    where a.opname_id = o1.id
  ), mv as (
    select m.item_id,
      coalesce(-sum(m.qty) filter (where m.type = 'use' and t.voided_at is null), 0) as used,
      coalesce(-sum(m.qty) filter (where m.type = 'sale' and t.voided_at is null), 0) as sold,
      coalesce(sum(m.qty) filter (where m.type = 'in'), 0) as incoming,
      coalesce(sum(m.qty) filter (where m.type = 'adjust' and m.transaction_id is null), 0) as adj
    from stock_moves m left join transactions t on t.id = m.transaction_id
    where m.created_at >= o1.started_at and m.created_at < o2.started_at
    group by m.item_id
  ), r as (
    select i.id, i.name, i.unit, i.unit_cost, coalesce(mv.used, 0) as th,
           l.q0 + coalesce(mv.incoming, 0) + coalesce(mv.adj, 0) - l.q1 - coalesce(mv.sold, 0) as ac
    from lines l join inventory_items i on i.id = l.item_id left join mv on mv.item_id = l.item_id
    where i.kind = 'consumable'
  )
  select r.id, r.name, r.unit, r.unit_cost, r.th, r.ac, r.ac - r.th,
         case when r.th > 0 then round((r.ac - r.th) * 100 / r.th, 1) end,
         round((r.ac - r.th) * r.unit_cost)::bigint,
         case when r.th > 0 then abs((r.ac - r.th) * 100 / r.th) > thr else r.ac <> 0 end
  from r order by r.name;
end $$;

-- Daftar belanja: item reorder/menipis + saran beli sampai multiplier × ambang (dibulatkan ke kelipatan min order).
create function shopping_list()
returns table (item_id uuid, name text, kind item_kind, unit text, qty numeric, reorder_at numeric, status text,
               suggested numeric, unit_cost numeric, est_cost bigint, supplier_id uuid, supplier_name text, supplier_whatsapp text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare mult numeric := (select reorder_suggest_multiplier from settings);
begin
  perform require_role('manager');
  return query
  select s.item_id, s.name, s.kind, s.unit, s.qty, s.reorder_at, s.status, g.sug, s.unit_cost,
         round(g.sug * s.unit_cost)::bigint, p.id, p.name, p.whatsapp
  from stock_levels s
  join inventory_items i on i.id = s.item_id
  left join suppliers p on p.id = s.supplier_id
  cross join lateral (select case when i.min_order_qty is null then ceil(greatest(0, mult * s.reorder_at - s.qty))
                                  else ceil(greatest(0, mult * s.reorder_at - s.qty) / i.min_order_qty) * i.min_order_qty end as sug) g
  where s.active and s.status in ('reorder', 'low')
  order by p.name nulls last, s.status desc, s.name;
end $$;

-- =====================================================================================================
-- 3. Komisi & payroll — sumber tunggal
-- =====================================================================================================
create function month_bounds(p_month date, out m0 timestamptz, out m1 timestamptz) language sql immutable as $$
  select jkt(date_trunc('month', p_month)::date, '00:00'), jkt((date_trunc('month', p_month) + interval '1 month')::date, '00:00')
$$;

-- Rincian komisi per item (4.6). Internal: tanpa cek peran, dipakai commission_* & payroll_close.
-- Periode tertutup memakai rasio di snapshot agar rincian = angka final.
create function commission_lines(p_month date, p_staff uuid default null)
returns table (transaction_item_id uuid, transaction_id uuid, staff_id uuid, created_at timestamptz, name text,
               category service_category, net_amount bigint, hpp bigint, pct numeric, commission bigint, from_upsell boolean)
language sql stable security definer set search_path = public as $$
  with b as (select * from month_bounds(p_month)), st as (select * from settings),
  per as (select id from payroll_periods where month = date_trunc('month', p_month)::date and status = 'closed')
  select ti.id, t.id, ti.staff_id, t.created_at, ti.name, ti.category, ti.net_amount, coalesce(c.hpp, 0),
         p.pct,
         case when ti.category = 'retail' then round(ti.net_amount * p.pct / 100.0)
              else round(greatest(0, ti.net_amount - coalesce(c.hpp, 0)) * p.pct / 100.0) end::bigint,
         ti.from_upsell
  from transaction_items ti
  join transactions t on t.id = ti.transaction_id
  join staff s on s.id = ti.staff_id
  left join transaction_item_costs c on c.transaction_item_id = ti.id
  cross join b cross join st
  cross join lateral (
    select case when ti.category = 'retail' then st.retail_commission_pct
                else coalesce((select ps.commission_pct from payroll_snapshots ps, per where ps.period_id = per.id and ps.staff_id = s.id),
                              s.commission_pct_override, st.commission_pct) end as pct) p
  where t.voided_at is null and t.created_at >= b.m0 and t.created_at < b.m1
    and (p_staff is null or ti.staff_id = p_staff)
$$;

-- Hitung live (tanpa melihat snapshot). Internal.
create function commission_live(p_month date)
returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int,
               revenue_net bigint, hpp_total bigint, commission_service bigint, commission_retail bigint,
               subsidy bigint, adjustments bigint, total_pay bigint)
language sql stable security definer set search_path = public as $$
  with st as (select * from settings), l as (select * from commission_lines(p_month)),
  agg as (
    select s.id, s.name, s.category, coalesce(s.commission_pct_override, st.commission_pct)::numeric as pct,
           count(l.*) filter (where l.category <> 'retail')::int as n,
           coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint as net,
           coalesce(sum(l.hpp) filter (where l.category <> 'retail'), 0)::bigint as hpp,
           coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint as cs,
           coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint as cr,
           coalesce((select sum(a.amount) from payroll_adjustments a where a.staff_id = s.id and a.month = date_trunc('month', p_month)::date), 0)::bigint as adj,
           st.min_monthly_pay as minpay, s.active, count(l.*) as any_items
    from staff s cross join st left join l on l.staff_id = s.id
    group by s.id, st.commission_pct, st.min_monthly_pay
  )
  select id, name, category, pct, n, net, hpp, cs, cr,
         greatest(0, minpay - (cs + cr))::bigint, adj, (cs + cr + greatest(0, minpay - (cs + cr)) + adj)::bigint
  from agg where active or any_items > 0 or adj <> 0
$$;

create function commission_for_period(p_month date, p_staff_id uuid default null)
returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int,
               revenue_net bigint, hpp_total bigint, commission_service bigint, commission_retail bigint,
               subsidy bigint, adjustments bigint, total_pay bigint, closed boolean,
               paid_at timestamptz, paid_method text, note text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare per payroll_periods; sid uuid;
begin
  perform require_role('manager', 'staff');
  sid := case when auth_role() = 'staff' then my_staff_id() else p_staff_id end;
  if auth_role() = 'staff' and sid is null then raise exception 'Akun belum ditautkan ke staf'; end if;
  select * into per from payroll_periods where month = date_trunc('month', p_month)::date;
  if per.status = 'closed' then
    return query
    select s.staff_id, s.staff_name, s.category, s.commission_pct, s.service_count, s.revenue_net,
           case when auth_role() = 'manager' then s.hpp_total end, s.commission_service, s.commission_retail,
           s.subsidy, s.adjustments, s.total_pay, true, s.paid_at, s.paid_method, s.note
    from payroll_snapshots s where s.period_id = per.id and (sid is null or s.staff_id = sid)
    order by s.category, s.staff_name;
  else
    return query
    select c.staff_id, c.staff_name, c.category, c.commission_pct, c.service_count, c.revenue_net,
           case when auth_role() = 'manager' then c.hpp_total end, c.commission_service, c.commission_retail,
           c.subsidy, c.adjustments, c.total_pay, false, null::timestamptz, null::text, ''::text
    from commission_live(p_month) c where sid is null or c.staff_id = sid
    order by c.category, c.staff_name;
  end if;
end $$;

-- Rincian per item. Kapster: hanya dirinya & kolom HPP kosong.
create function commission_items(p_month date, p_staff_id uuid default null)
returns table (transaction_item_id uuid, transaction_id uuid, created_at timestamptz, name text, category service_category,
               net_amount bigint, hpp bigint, commission bigint, from_upsell boolean)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare sid uuid;
begin
  perform require_role('manager', 'staff');
  sid := case when auth_role() = 'staff' then my_staff_id() else p_staff_id end;
  if sid is null then raise exception 'Pilih staf'; end if;
  return query
  select l.transaction_item_id, l.transaction_id, l.created_at, l.name, l.category, l.net_amount,
         case when auth_role() = 'manager' then l.hpp end, l.commission, l.from_upsell
  from commission_lines(p_month, sid) l order by l.created_at desc;
end $$;

create function period_is_closed(p_at timestamptz) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from payroll_periods where status = 'closed' and month = date_trunc('month', p_at at time zone 'Asia/Jakarta')::date)
$$;

create function payroll_add_adjustment(p_staff_id uuid, p_month date, p_kind text, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; aid uuid;
begin
  perform require_role('manager');
  if exists (select 1 from payroll_periods where month = m and status = 'closed') then
    raise exception 'Periode gaji % sudah ditutup. Buka ulang dulu.', to_char(m, 'MM/YYYY');
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan wajib diisi'; end if;
  insert into payroll_adjustments (staff_id, month, kind, amount, reason)
  values (p_staff_id, m, p_kind, case when p_kind = 'deduction' then -abs(p_amount) when p_kind = 'bonus' then abs(p_amount) else p_amount end, trim(p_reason))
  returning id into aid;
  return aid;
end $$;

create function payroll_close(p_month date) returns int
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; pid uuid; n int;
begin
  perform require_role('manager');
  if m > date_trunc('month', jkt_today())::date then raise exception 'Periode di masa depan belum bisa ditutup'; end if;
  insert into payroll_periods (month) values (m) on conflict (month) do nothing;
  select id into pid from payroll_periods where month = m and status = 'open' for update;
  if pid is null then raise exception 'Periode sudah ditutup'; end if;
  insert into payroll_snapshots (period_id, staff_id, staff_name, category, commission_pct, service_count, revenue_net, hpp_total,
                                 commission_service, commission_retail, subsidy, adjustments, total_pay)
  select pid, c.staff_id, c.staff_name, c.category, c.commission_pct, c.service_count, c.revenue_net, c.hpp_total,
         c.commission_service, c.commission_retail, c.subsidy, c.adjustments, c.total_pay
  from commission_live(m) c;
  get diagnostics n = row_count;
  update payroll_periods set status = 'closed', closed_by = auth.uid(), closed_at = now() where id = pid;
  insert into notifications (target_role, target_user, kind, payload)
  select 'staff', p.id, 'payroll_ready', jsonb_build_object('month', m)
  from profiles p join payroll_snapshots s on s.staff_id = p.staff_id and s.period_id = pid where p.active;
  return n;
end $$;

create function payroll_reopen(p_month date, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare m date := date_trunc('month', p_month)::date; pid uuid;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan buka ulang wajib diisi'; end if;
  select id into pid from payroll_periods where month = m and status = 'closed' for update;
  if pid is null then raise exception 'Periode belum ditutup'; end if;
  delete from payroll_snapshots where period_id = pid;
  update payroll_periods set status = 'open', reopened_by = auth.uid(), reopened_at = now(), reopen_reason = trim(p_reason) where id = pid;
end $$;

create function payroll_mark_paid(p_month date, p_staff_id uuid, p_method text, p_paid_at timestamptz default now(), p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if p_method not in ('tunai', 'transfer') then raise exception 'Metode bayar: tunai atau transfer'; end if;
  update payroll_snapshots s set paid_at = coalesce(p_paid_at, now()), paid_method = p_method, paid_by = auth.uid(),
    note = coalesce(nullif(trim(coalesce(p_note, '')), ''), s.note)
  from payroll_periods p
  where p.id = s.period_id and p.month = date_trunc('month', p_month)::date and p.status = 'closed' and s.staff_id = p_staff_id;
  if not found then raise exception 'Tutup periode dulu sebelum menandai dibayar'; end if;
end $$;

-- 4.7 Peringkat pendapatan jasa bersih. Kapster: hanya barisnya sendiri (+ jumlah peserta).
create function staff_leaderboard(p_from date, p_to date)
returns table (rank int, of_count int, staff_id uuid, staff_name text, category staff_category,
               revenue_net bigint, service_count int, avg_per_service bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_role('manager', 'staff');
  return query
  with rev as (
    select s.id, s.name, s.category,
           coalesce(sum(ti.net_amount) filter (where t.id is not null), 0)::bigint as net,
           count(t.id)::int as n
    from staff s
    left join transaction_items ti on ti.staff_id = s.id and ti.category <> 'retail'
    left join transactions t on t.id = ti.transaction_id and t.voided_at is null
      and t.created_at >= jkt(p_from, '00:00') and t.created_at < jkt(p_to + 1, '00:00')
    where s.active or t.id is not null
    group by s.id
  ), ranked as (
    select row_number() over (order by net desc, n desc, name)::int as rk, count(*) over ()::int as total, *
    from rev
  )
  select r.rk, r.total, r.id, r.name, r.category, r.net, r.n, case when r.n > 0 then round(r.net::numeric / r.n)::bigint else 0 end
  from ranked r where auth_role() = 'manager' or r.id = my_staff_id()
  order by r.rk;
end $$;

-- 4.8 Evaluasi tahunan.
create function staff_annual_review(p_year int)
returns table (staff_id uuid, staff_name text, category staff_category, revenue_net bigint, service_count int,
               avg_per_service bigint, upsell_rate numeric, return_rate numeric, work_days int, off_days int,
               total_paid bigint, note text)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
declare y0 timestamptz := jkt(make_date(p_year, 1, 1), '00:00'); y1 timestamptz := jkt(make_date(p_year + 1, 1, 1), '00:00');
begin
  perform require_role('manager');
  return query
  with it as (
    select ti.staff_id, ti.net_amount, ti.category, ti.from_upsell, t.id as tx, t.customer_id, t.created_at,
           (t.created_at at time zone 'Asia/Jakarta')::date as d
    from transaction_items ti join transactions t on t.id = ti.transaction_id
    where t.voided_at is null and ti.staff_id is not null
  ), yr as (select * from it where created_at >= y0 and created_at < y1),
  svc as (
    select staff_id, sum(net_amount)::bigint as net, count(*)::int as n, count(distinct d)::int as days
    from yr where category <> 'retail' group by staff_id
  ), ups as (
    select staff_id, count(distinct tx) filter (where from_upsell)::numeric as up, count(distinct tx)::numeric as txs
    from yr group by staff_id
  ), visits as (select distinct staff_id, customer_id, d from it where category <> 'retail' and customer_id is not null),
  ret as (
    select v.staff_id, count(distinct v.customer_id)::numeric as custs,
           count(distinct v.customer_id) filter (where exists (
             select 1 from visits w where w.staff_id = v.staff_id and w.customer_id = v.customer_id and w.d > v.d and w.d - v.d <= 60))::numeric as back
    from visits v where v.d >= make_date(p_year, 1, 1) and v.d < make_date(p_year + 1, 1, 1)
    group by v.staff_id
  ), offd as (
    select o.staff_id, count(distinct g.d)::int as days
    from staff_time_off o
    cross join lateral generate_series((o.start_at at time zone 'Asia/Jakarta')::date,
                                       ((o.end_at - interval '1 second') at time zone 'Asia/Jakarta')::date, interval '1 day') g(d)
    where o.status = 'approved' and extract(year from g.d) = p_year
    group by o.staff_id
  ), paid as (
    select s.staff_id, sum(s.total_pay)::bigint as total
    from payroll_snapshots s join payroll_periods p on p.id = s.period_id
    where extract(year from p.month) = p_year group by s.staff_id
  )
  select s.id, s.name, s.category, coalesce(svc.net, 0), coalesce(svc.n, 0),
         case when coalesce(svc.n, 0) > 0 then round(svc.net::numeric / svc.n)::bigint else 0 end,
         case when coalesce(ups.txs, 0) > 0 then round(ups.up * 100 / ups.txs, 1) else 0 end,
         case when coalesce(ret.custs, 0) > 0 then round(ret.back * 100 / ret.custs, 1) else 0 end,
         coalesce(svc.days, 0), coalesce(offd.days, 0), coalesce(paid.total, 0), coalesce(rn.note, '')
  from staff s
  left join svc on svc.staff_id = s.id left join ups on ups.staff_id = s.id left join ret on ret.staff_id = s.id
  left join offd on offd.staff_id = s.id left join paid on paid.staff_id = s.id
  left join staff_review_notes rn on rn.staff_id = s.id and rn.year = p_year
  where s.active or svc.n is not null
  order by coalesce(svc.net, 0) desc, s.name;
end $$;

-- Tahap 2 → sumber tunggal: fungsi lama diganti commission_for_period / commission_items / staff_leaderboard.
drop function staff_commission_monthly(date);
drop function staff_commission_items(date, uuid);
drop function staff_commission_rank(date);
create or replace function staff_commission_terms() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ratio', coalesce(s.commission_pct_override, st.commission_pct), 'min_pay', st.min_monthly_pay,
                            'retail_pct', st.retail_commission_pct)
  from staff s, settings st where s.id = my_staff_id()
$$;

-- =====================================================================================================
-- Perubahan fungsi lama: void (kunci periode + alasan mutasi) & checkout (from_upsell, penjual ritel)
-- =====================================================================================================
create or replace function void_transaction(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare tx_at timestamptz;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan void wajib diisi'; end if;
  select created_at into tx_at from transactions where id = p_id;
  if tx_at is not null and period_is_closed(tx_at) then
    raise exception 'Periode gaji % sudah ditutup. Buka ulang dulu.', to_char(tx_at at time zone 'Asia/Jakarta', 'MM/YYYY');
  end if;
  update transactions set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah di-void'; end if;
  insert into stock_moves (item_id, qty, type, transaction_id, reason, note)
  select item_id, -qty, 'adjust', p_id, 'koreksi', 'Void: ' || trim(p_reason) from stock_moves where transaction_id = p_id;
  perform set_config('app.via_void', 'on', true);
  update appointments set status = 'completed'
  where status = 'paid' and id in (select appointment_id from transaction_items where transaction_id = p_id);
  perform set_config('app.via_void', 'off', true);
end $$;

create or replace function checkout(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  st settings; lines jsonb; n int; cnt int; appt_ids uuid[]; cid uuid := nullif(p ->> 'customer_id', '')::uuid;
  sub bigint; base bigint; has_b boolean; has_n boolean; disc bigint := 0; total bigint; dep bigint := 0;
  method text := p ->> 'method'; meth pay_method; txid uuid; tiid uuid; l jsonb; share bigint;
  allocated bigint := 0; last_svc int; i int := 0; received bigint := nullif(p ->> 'cash_received', '')::bigint;
begin
  perform require_role('manager', 'cashier');
  select * into st from settings;
  if method not in ('cash', 'qris') then raise exception 'Metode bayar tidak valid'; end if;
  n := coalesce(jsonb_array_length(p -> 'items'), 0);
  if n = 0 then raise exception 'Keranjang kosong'; end if;

  select array_agg(distinct (e ->> 'appointment_id')::uuid) into appt_ids
  from jsonb_array_elements(p -> 'items') e where nullif(e ->> 'appointment_id', '') is not null;
  if appt_ids is not null then
    perform 1 from appointments where id = any (appt_ids) for update;
    if (select count(*) from appointments where id = any (appt_ids) and status not in ('paid', 'cancelled'))
       <> array_length(appt_ids, 1) then
      raise exception 'Booking tidak ditemukan, sudah dibayar, atau dibatalkan';
    end if;
    cid := coalesce(cid, (select customer_id from appointments where id = any (appt_ids) and customer_id is not null limit 1));
  end if;
  if cid is not null then
    perform 1 from customers where id = cid for update;
    if not found then raise exception 'Pelanggan tidak ditemukan'; end if;
  end if;

  -- Ritel: staff_id = staf penjual (opsional). Layanan: kapster (wajib).
  select jsonb_agg(jsonb_build_object(
           'service_id', s.id, 'name', s.name, 'category', s.category, 'price', s.price,
           'staff_id', case when s.category = 'retail' then nullif(e.v ->> 'staff_id', '')::uuid
                            else coalesce(nullif(e.v ->> 'staff_id', '')::uuid, a.staff_id) end,
           'appointment_id', a.id, 'stock_item_id', s.stock_item_id,
           'from_upsell', coalesce((e.v ->> 'from_upsell')::boolean, false)) order by e.ord),
         count(*)
  into lines, cnt
  from jsonb_array_elements(p -> 'items') with ordinality e(v, ord)
  join services s on s.id = (e.v ->> 'service_id')::uuid
  left join appointments a on a.id = nullif(e.v ->> 'appointment_id', '')::uuid;
  if cnt <> n then raise exception 'Layanan tidak ditemukan'; end if;
  if exists (select 1 from jsonb_array_elements(lines) x where x ->> 'category' <> 'retail' and x ->> 'staff_id' is null) then
    raise exception 'Pilih kapster untuk setiap layanan';
  end if;
  if exists (select 1 from jsonb_array_elements(lines) x where x ->> 'staff_id' is not null
             and not exists (select 1 from staff where id = (x ->> 'staff_id')::uuid and active)) then
    raise exception 'Staf tidak ditemukan';
  end if;

  select sum((x ->> 'price')::bigint),
         coalesce(sum((x ->> 'price')::bigint) filter (where x ->> 'category' <> 'retail'), 0),
         bool_or(x ->> 'category' = 'barbershop'), bool_or(x ->> 'category' = 'nail'),
         max(o) filter (where x ->> 'category' <> 'retail')
  into sub, base, has_b, has_n, last_svc
  from jsonb_array_elements(lines) with ordinality y(x, o);

  if has_b and has_n then disc := round(base * st.bundle_pct / 10000.0) * 100; end if;
  total := sub - disc;
  if coalesce((p ->> 'use_deposit')::boolean, false) then
    if cid is null then raise exception 'Deposit butuh data pelanggan'; end if;
    dep := least(greatest(deposit_balance_of(cid), 0), total);
  end if;
  meth := case when dep > 0 and dep < total then ('deposit_' || method)::pay_method
               when dep > 0 then 'deposit' else method::pay_method end;

  if method = 'cash' and total - dep > 0 then
    received := coalesce(received, total - dep);  -- tanpa input = uang pas
    if received < total - dep then raise exception 'Uang diterima kurang dari tagihan'; end if;
  else
    received := null;
  end if;

  insert into transactions (customer_id, subtotal, discount_amount, discount_label, total, deposit_used,
                            paid_amount, payment_method, cashier_id, cash_received)
  values (cid, sub, disc, case when disc > 0 then 'Groom & Bloom ' || st.bundle_pct || '%' else '' end,
          total, dep, total - dep, meth, auth.uid(), received)
  returning id into txid;

  for l in select * from jsonb_array_elements(lines) loop
    i := i + 1;
    share := 0;
    if disc > 0 and l ->> 'category' <> 'retail' then
      share := case when i = last_svc then disc - allocated
                    else floor(disc::numeric * (l ->> 'price')::bigint / base)::bigint end;
      allocated := allocated + share;
    end if;

    insert into transaction_items (transaction_id, service_id, appointment_id, staff_id, name, category,
                                   price, discount_share, net_amount, from_upsell)
    values (txid, (l ->> 'service_id')::uuid, (l ->> 'appointment_id')::uuid, (l ->> 'staff_id')::uuid,
            l ->> 'name', (l ->> 'category')::service_category, (l ->> 'price')::bigint, share,
            (l ->> 'price')::bigint - share, (l ->> 'from_upsell')::boolean)
    returning id into tiid;
    insert into transaction_item_costs (transaction_item_id, hpp) values (tiid, service_hpp((l ->> 'service_id')::uuid));

    if l ->> 'category' = 'retail' then
      if l ->> 'stock_item_id' is not null then
        insert into stock_moves (item_id, qty, type, transaction_id, note)
        values ((l ->> 'stock_item_id')::uuid, -1, 'sale', txid, 'Terjual di kasir');
      end if;
    else
      insert into stock_moves (item_id, qty, type, transaction_id, note)
      select sm.item_id, -sm.qty, 'use', txid, 'Dipakai: ' || (l ->> 'name')
      from service_materials sm where sm.service_id = (l ->> 'service_id')::uuid;
    end if;
  end loop;

  if appt_ids is not null then
    perform set_config('app.via_checkout', 'on', true);
    update appointments set status = 'paid' where id = any (appt_ids);
    perform set_config('app.via_checkout', 'off', true);
  end if;
  return txid;
end $$;

-- service_hpp: pembulatan setengah ke atas (round numeric) — sama seperti sebelumnya, kini dengan harga pokok pecahan.
create or replace function service_hpp(sid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select case when s.category = 'retail'
    then coalesce(round((select unit_cost from inventory_items where id = s.stock_item_id)), 0)::bigint
    else coalesce(round((select sum(sm.qty * i.unit_cost) from service_materials sm
                         join inventory_items i on i.id = sm.item_id where sm.service_id = s.id)), 0)::bigint
  end from services s where s.id = sid
$$;

-- =====================================================================================================
-- Hak eksekusi: helper internal ditutup.
-- =====================================================================================================
revoke execute on function notify(app_role, text, jsonb, uuid), stock_of(uuid), commission_lines(date, uuid),
  commission_live(date), period_is_closed(timestamptz), stock_cross_reorder(), guard_unit_cost(), guard_item_delete(),
  suppliers_normalize(), service_hpp(uuid)
  from public, anon, authenticated;
revoke execute on function receive_stock(uuid, numeric, numeric, uuid, text, text, text), adjust_stock(uuid, numeric, text, text),
  set_unit_cost(uuid, numeric, text), save_recipe(uuid, jsonb), opname_start(text), opname_save_counts(uuid, jsonb),
  opname_approve(uuid), opname_cancel(uuid), usage_report(uuid, uuid), shopping_list(), commission_for_period(date, uuid),
  commission_items(date, uuid), payroll_add_adjustment(uuid, date, text, bigint, text), payroll_close(date),
  payroll_reopen(date, text), payroll_mark_paid(date, uuid, text, timestamptz, text), staff_leaderboard(date, date),
  staff_annual_review(int), mark_notifications_read(uuid[])
  from public, anon;
