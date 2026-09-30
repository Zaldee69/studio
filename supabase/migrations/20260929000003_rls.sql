-- Row Level Security. Tanpa policy = tertutup. Tulis ke tabel keuangan/stok/SOP hanya lewat RPC (security definer).

do $$
declare t text;
begin
  foreach t in array array[
    'settings','staff','customers','profiles','resources','inventory_items','services','service_materials',
    'appointments','appointment_services','transactions','transaction_items','transaction_item_costs',
    'deposit_packages','deposit_topups','stock_opnames','stock_moves','sop_tool_groups','sop_logs',
    'sop_approvals','maintenance_tasks','maintenance_logs','booking_attempts']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- Master data yang dikelola penuh oleh manajer.
do $$
declare t text;
begin
  foreach t in array array['settings','staff','resources','inventory_items','services','service_materials',
                           'deposit_packages','sop_tool_groups','maintenance_tasks']
  loop
    execute format($f$create policy manager_all on %I for all to authenticated
                      using (auth_role() = 'manager') with check (auth_role() = 'manager')$f$, t);
  end loop;
end $$;

-- ---------- Baca per peran ----------
create policy team_read on services for select to authenticated using (auth_role() in ('cashier', 'staff'));
create policy team_read on resources for select to authenticated using (auth_role() in ('cashier', 'staff'));
create policy cashier_read on deposit_packages for select to authenticated using (auth_role() = 'cashier');
create policy staff_read on sop_tool_groups for select to authenticated using (auth_role() = 'staff');
create policy staff_read on maintenance_tasks for select to authenticated using (auth_role() = 'staff');

-- staff: kasir melihat semua staf aktif (pilih kapster di keranjang), kapster hanya dirinya.
create policy cashier_read on staff for select to authenticated using (auth_role() = 'cashier');
create policy self_read on staff for select to authenticated using (id = my_staff_id());

-- profiles
create policy self_read on profiles for select to authenticated using (id = auth.uid());
create policy self_update on profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy manager_all on profiles for all to authenticated
  using (auth_role() = 'manager') with check (auth_role() = 'manager');

-- customers
create policy front_all on customers for all to authenticated
  using (auth_role() in ('manager', 'cashier')) with check (auth_role() in ('manager', 'cashier'));
create policy self_read on customers for select to authenticated using (id = my_customer_id());
create policy staff_served on customers for select to authenticated using (
  auth_role() = 'staff' and exists (
    select 1 from appointments a where a.customer_id = customers.id and a.staff_id = my_staff_id()));

-- appointments: insert lewat RPC (cek bentrok). Kasir/manajer boleh ubah (jadwal ulang, batal).
create policy front_read on appointments for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy front_update on appointments for update to authenticated
  using (auth_role() in ('manager', 'cashier')) with check (auth_role() in ('manager', 'cashier'));
create policy staff_own on appointments for select to authenticated
  using (auth_role() = 'staff' and staff_id = my_staff_id());
create policy customer_own on appointments for select to authenticated
  using (auth_role() = 'customer' and customer_id = my_customer_id());

create policy front_read on appointment_services for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy front_write on appointment_services for all to authenticated
  using (auth_role() in ('manager', 'cashier')) with check (auth_role() in ('manager', 'cashier'));
create policy own_read on appointment_services for select to authenticated using (
  exists (select 1 from appointments a where a.id = appointment_id
          and ((auth_role() = 'staff' and a.staff_id = my_staff_id())
            or (auth_role() = 'customer' and a.customer_id = my_customer_id()))));

-- Transaksi: baca saja. Tidak ada policy insert/update/delete untuk peran mana pun.
create policy front_read on transactions for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy customer_own on transactions for select to authenticated
  using (auth_role() = 'customer' and customer_id = my_customer_id());
create policy front_read on transaction_items for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy customer_own on transaction_items for select to authenticated using (
  auth_role() = 'customer' and exists (
    select 1 from transactions t where t.id = transaction_id and t.customer_id = my_customer_id()));
create policy manager_read on transaction_item_costs for select to authenticated using (auth_role() = 'manager');

create policy front_read on deposit_topups for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy customer_own on deposit_topups for select to authenticated
  using (auth_role() = 'customer' and customer_id = my_customer_id());

-- Inventaris: manajer saja. Barang masuk (type 'in'/'adjust') boleh insert langsung; sisanya lewat RPC.
create policy manager_read on stock_moves for select to authenticated using (auth_role() = 'manager');
create policy manager_in on stock_moves for insert to authenticated
  with check (auth_role() = 'manager' and type in ('in', 'adjust') and transaction_id is null and opname_id is null);
create policy manager_read on stock_opnames for select to authenticated using (auth_role() = 'manager');

-- SOP & perawatan
create policy sop_read on sop_logs for select to authenticated using (auth_role() in ('manager', 'staff'));
create policy sop_read on sop_approvals for select to authenticated using (auth_role() in ('manager', 'staff'));
create policy maint_read on maintenance_logs for select to authenticated using (auth_role() in ('manager', 'staff'));
create policy maint_insert on maintenance_logs for insert to authenticated
  with check (auth_role() in ('manager', 'staff') and done_by = auth.uid());

-- ---------- Hak eksekusi fungsi ----------
-- Supabase memberi EXECUTE ke anon/authenticated secara default. Tutup helper internal.
revoke execute on function deposit_balance_of(uuid), service_hpp(uuid), handle_new_user(),
  require_role(app_role[]) from public, anon, authenticated;
