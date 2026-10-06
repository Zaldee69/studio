-- Anti-fraud tahap 1 (kasir / kapster / nail artist):
--  1. Top-up deposit: tanpa paket resmi, saldo = uang dibayar (bonus manual hanya manajer).
--  2. Tutup kasir "buta": kasir tidak melihat angka kas sistem sebelum menutup; kasir hanya sekali per tanggal
--     (hari ini/kemarin). Koreksi = penutupan baru oleh manajer.
--  3. Pelanggan hanya bisa dihapus manajer. Booking tidak bisa diubah langsung (tanpa jejak) — semua lewat RPC.
--  4. Kapster/nail artist pada item kasir = staf di booking (komisi tidak bisa dialihkan diam-diam).

-- ---------- 1. Top-up ----------
create or replace function topup_deposit(p_customer_id uuid, p_method text, p_package_id uuid default null,
                                         p_amount_paid bigint default null, p_amount_credited bigint default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare pk deposit_packages; id uuid;
begin
  perform require_role('manager', 'cashier');
  if p_method not in ('cash', 'qris') then raise exception 'Metode bayar tidak valid'; end if;
  if p_package_id is not null then
    select * into pk from deposit_packages where deposit_packages.id = p_package_id and active;
    if not found then raise exception 'Paket tidak ditemukan'; end if;
    p_amount_paid := pk.amount_paid;
    p_amount_credited := pk.amount_credited;
  else
    if coalesce(p_amount_paid, 0) <= 0 then raise exception 'Isi nominal top-up'; end if;
    if auth_role() = 'manager' then
      p_amount_credited := coalesce(p_amount_credited, p_amount_paid);
      if p_amount_credited < p_amount_paid then raise exception 'Saldo tidak boleh kurang dari uang dibayar'; end if;
    else
      -- kasir: bonus hanya lewat paket resmi
      p_amount_credited := p_amount_paid;
    end if;
  end if;
  insert into deposit_topups (customer_id, package_id, amount_paid, amount_credited, method)
  values (p_customer_id, p_package_id, p_amount_paid, p_amount_credited, p_method::pay_method)
  returning deposit_topups.id into id;
  return id;
end $$;

-- ---------- 2. Tutup kasir buta ----------
alter function cash_summary(date) rename to cash_summary_full;
revoke execute on function cash_summary_full(date) from public, anon, authenticated;

-- Kasir sebelum menutup tanggal itu: hanya jumlah transaksi & void (tanpa angka uang / kas diharapkan).
create function cash_summary(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb := cash_summary_full(p_date);
begin
  if auth_role() = 'cashier' and not exists (select 1 from cash_closings where date = p_date) then
    return jsonb_build_object('date', p_date, 'blind', true, 'tx_count', r -> 'tx_count', 'voided', r -> 'voided');
  end if;
  return r || jsonb_build_object('blind', false);
end $$;

create or replace function save_cash_closing(p_date date, p_physical_cash bigint, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare s jsonb; id uuid;
begin
  perform require_role('manager', 'cashier');
  if p_physical_cash is null or p_physical_cash < 0 then raise exception 'Isi kas fisik'; end if;
  perform pg_advisory_xact_lock(hashtext('cash_closing:' || p_date));
  if auth_role() = 'cashier' then
    if p_date not between jkt_today() - 1 and jkt_today() then raise exception 'Kasir hanya bisa menutup hari ini atau kemarin'; end if;
    if exists (select 1 from cash_closings where date = p_date) then
      raise exception 'Kasir tanggal ini sudah ditutup. Koreksi dilakukan manajer.';
    end if;
  end if;
  s := cash_summary_full(p_date);
  insert into cash_closings (date, expected_cash, physical_cash, summary, note)
  values (p_date, (s ->> 'expected_cash')::bigint, p_physical_cash, s, coalesce(p_note, ''))
  returning cash_closings.id into id;
  return id;
end $$;

-- ---------- 3. Pelanggan & booking ----------
drop policy front_all on customers;
create policy front_read on customers for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy front_insert on customers for insert to authenticated with check (auth_role() in ('manager', 'cashier'));
create policy front_update on customers for update to authenticated
  using (auth_role() in ('manager', 'cashier')) with check (auth_role() in ('manager', 'cashier'));
create policy manager_delete on customers for delete to authenticated using (auth_role() = 'manager');

-- Kasir/manajer mengubah booking hanya lewat RPC (jadwal ulang, status, batal + alasan, tidak datang).
drop policy front_update on appointments;

create function dismiss_change_request(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  update appointments set change_request = null, change_requested_at = null where id = p_id;
end $$;

-- ---------- 4. Staf item kasir = staf booking ----------
create function check_item_staff() returns trigger language plpgsql set search_path = public as $$
declare booked uuid;
begin
  if new.appointment_id is null or new.category = 'retail' then return new; end if;
  select staff_id into booked from appointments where id = new.appointment_id;
  if booked is not null and new.staff_id is distinct from booked then
    raise exception 'Kapster/nail artist "%" berbeda dengan booking. Bila memang diganti, ubah booking dulu (tercatat).', new.name;
  end if;
  return new;
end $$;
create trigger transaction_items_staff_match before insert on transaction_items
  for each row execute function check_item_staff();
