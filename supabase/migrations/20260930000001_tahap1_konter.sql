-- Tahap 1 — Konter: jadwal, kasir, pelanggan, tutup kasir, impor.

-- ---------- Booking: alasan batal, status koreksi, booking lunas terkunci ----------
alter table appointments add column cancel_reason text;

-- Booking 'paid' hanya boleh berubah lewat void_transaction (flag transaksi-lokal).
create or replace function guard_appt_paid() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid'
     and current_setting('app.via_checkout', true) is distinct from 'on' then
    raise exception 'Status paid hanya lewat checkout';
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid'
     and (new.status, new.start_at, new.duration_min, new.resource_id, new.staff_id, new.customer_id)
         is distinct from (old.status, old.start_at, old.duration_min, old.resource_id, old.staff_id, old.customer_id)
     and current_setting('app.via_void', true) is distinct from 'on' then
    raise exception 'Booking lunas hanya bisa diubah lewat void transaksi';
  end if;
  return new;
end $$;
drop trigger appointments_paid_guard on appointments;
create trigger appointments_paid_guard before insert or update on appointments
  for each row execute function guard_appt_paid();

create or replace function void_transaction(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan void wajib diisi'; end if;
  update transactions set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah di-void'; end if;
  insert into stock_moves (item_id, qty, type, transaction_id, note)
  select item_id, -qty, 'adjust', p_id, 'Void: ' || trim(p_reason) from stock_moves where transaction_id = p_id;
  perform set_config('app.via_void', 'on', true);
  update appointments set status = 'completed'
  where status = 'paid' and id in (select appointment_id from transaction_items where transaction_id = p_id);
  perform set_config('app.via_void', 'off', true);
end $$;

-- Koreksi status oleh kasir/manajer: maju/mundur bebas, kecuali ke/dari 'paid' dan 'cancelled'.
create function set_appointment_status(p_id uuid, p_status appt_status) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  if p_status in ('paid', 'cancelled') then raise exception 'Gunakan kasir / batalkan booking'; end if;
  update appointments set status = p_status where id = p_id and status not in ('paid', 'cancelled');
  if not found then raise exception 'Booking tidak ditemukan, sudah lunas, atau dibatalkan'; end if;
end $$;

create function cancel_booking_admin(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan pembatalan wajib diisi'; end if;
  update appointments set status = 'cancelled', cancel_reason = trim(p_reason)
  where id = p_id and status not in ('paid', 'cancelled');
  if not found then raise exception 'Booking tidak ditemukan, sudah lunas, atau dibatalkan'; end if;
end $$;

create or replace function cancel_my_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('customer');
  update appointments set status = 'cancelled', cancel_reason = 'Dibatalkan pelanggan'
  where id = p_id and customer_id = my_customer_id() and status = 'booked';
  if not found then raise exception 'Booking tidak bisa dibatalkan'; end if;
end $$;

-- Daftar bentrok (resource ATAU staf sama, waktu tumpang tindih) + siapa & jam berapa.
create function booking_conflicts(p_resource_id uuid, p_staff_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'start_at', a.start_at, 'end_at', a.end_at,
           'customer_name', coalesce(c.name, 'Walk-in'), 'staff_name', s.name, 'resource_name', r.name,
           'same_resource', a.resource_id = p_resource_id, 'same_staff', a.staff_id = p_staff_id)
         order by a.start_at), '[]')
  from appointments a
  left join customers c on c.id = a.customer_id
  left join staff s on s.id = a.staff_id
  join resources r on r.id = a.resource_id
  where a.status <> 'cancelled' and a.start_at < p_end and a.end_at > p_start
    and (a.resource_id = p_resource_id or a.staff_id = p_staff_id)
    and a.id is distinct from p_exclude
$$;

-- create_booking_admin v2: durasi bisa di-override, kembalikan pelanggan yang dipakai.
drop function create_booking_admin(uuid, uuid, timestamptz, uuid[], uuid, text, text, appt_source, text, boolean);
create function create_booking_admin(
  p_resource_id uuid, p_staff_id uuid, p_start_at timestamptz, p_service_ids uuid[],
  p_customer_id uuid default null, p_name text default null, p_whatsapp text default null,
  p_source appt_source default 'admin', p_notes text default '', p_force boolean default false,
  p_duration int default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  dur int; conflicts jsonb; cid uuid := p_customer_id; wa text; aid uuid; existing boolean := false;
begin
  perform require_role('manager', 'cashier');
  if p_source = 'online' then raise exception 'Gunakan create_online_booking'; end if;
  if coalesce(array_length(p_service_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu layanan'; end if;
  if p_duration is not null and p_duration not between 5 and 720 then raise exception 'Durasi tidak valid'; end if;
  select coalesce(p_duration, nullif(sum(duration_min), 0), 30) into dur from services where id = any (p_service_ids);

  perform lock_booking_day((p_start_at at time zone 'Asia/Jakarta')::date);
  conflicts := booking_conflicts(p_resource_id, p_staff_id, p_start_at, p_start_at + make_interval(mins => dur));
  if jsonb_array_length(conflicts) > 0 and not p_force then
    return jsonb_build_object('saved', false, 'conflicts', conflicts);
  end if;

  if cid is null and length(trim(coalesce(p_name, ''))) > 0 then
    wa := normalize_wa(p_whatsapp);
    if trim(coalesce(p_whatsapp, '')) <> '' and wa is null then raise exception 'No. WhatsApp tidak valid'; end if;
    if wa is not null then select id into cid from customers where whatsapp = wa; existing := cid is not null; end if;
    if cid is null then insert into customers (name, whatsapp) values (trim(p_name), wa) returning id into cid; end if;
  end if;

  insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes)
  values (cid, p_resource_id, p_staff_id, p_start_at, dur, p_source, coalesce(p_notes, ''))
  returning id into aid;
  insert into appointment_services (appointment_id, service_id) select aid, unnest(p_service_ids);
  return jsonb_build_object('saved', true, 'appointment_id', aid, 'customer_id', cid,
                            'customer_existing', existing, 'conflicts', conflicts);
end $$;

-- Ubah booking (jam/resource/kapster/layanan/durasi) dengan cek bentrok yang sama.
create function update_booking_admin(
  p_id uuid, p_resource_id uuid, p_staff_id uuid, p_start_at timestamptz, p_service_ids uuid[],
  p_duration int default null, p_notes text default null, p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare dur int; conflicts jsonb;
begin
  perform require_role('manager', 'cashier');
  if coalesce(array_length(p_service_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu layanan'; end if;
  if p_duration is not null and p_duration not between 5 and 720 then raise exception 'Durasi tidak valid'; end if;
  perform 1 from appointments where id = p_id and status not in ('paid', 'cancelled') for update;
  if not found then raise exception 'Booking tidak ditemukan, sudah lunas, atau dibatalkan'; end if;
  select coalesce(p_duration, nullif(sum(duration_min), 0), 30) into dur from services where id = any (p_service_ids);

  perform lock_booking_day((p_start_at at time zone 'Asia/Jakarta')::date);
  conflicts := booking_conflicts(p_resource_id, p_staff_id, p_start_at, p_start_at + make_interval(mins => dur), p_id);
  if jsonb_array_length(conflicts) > 0 and not p_force then
    return jsonb_build_object('saved', false, 'conflicts', conflicts);
  end if;

  update appointments set resource_id = p_resource_id, staff_id = p_staff_id, start_at = p_start_at,
    duration_min = dur, notes = coalesce(p_notes, notes)
  where id = p_id;
  delete from appointment_services where appointment_id = p_id;
  insert into appointment_services (appointment_id, service_id) select p_id, unnest(p_service_ids);
  return jsonb_build_object('saved', true, 'appointment_id', p_id, 'conflicts', conflicts);
end $$;

-- ---------- Kasir: uang diterima (kembalian) ----------
alter table transactions add column cash_received bigint check (cash_received >= 0);

-- checkout v3 = v2 + cash_received. payload: {..., cash_received?} — wajib ≥ sisa bayar untuk Tunai.
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

  select jsonb_agg(jsonb_build_object(
           'service_id', s.id, 'name', s.name, 'category', s.category, 'price', s.price,
           'staff_id', case when s.category = 'retail' then null
                            else coalesce(nullif(e.v ->> 'staff_id', '')::uuid, a.staff_id) end,
           'appointment_id', a.id, 'stock_item_id', s.stock_item_id) order by e.ord),
         count(*)
  into lines, cnt
  from jsonb_array_elements(p -> 'items') with ordinality e(v, ord)
  join services s on s.id = (e.v ->> 'service_id')::uuid
  left join appointments a on a.id = nullif(e.v ->> 'appointment_id', '')::uuid;
  if cnt <> n then raise exception 'Layanan tidak ditemukan'; end if;
  if exists (select 1 from jsonb_array_elements(lines) x where x ->> 'category' <> 'retail' and x ->> 'staff_id' is null) then
    raise exception 'Pilih kapster untuk setiap layanan';
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
                                   price, discount_share, net_amount)
    values (txid, (l ->> 'service_id')::uuid, (l ->> 'appointment_id')::uuid, (l ->> 'staff_id')::uuid,
            l ->> 'name', (l ->> 'category')::service_category, (l ->> 'price')::bigint, share,
            (l ->> 'price')::bigint - share)
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

-- ---------- View untuk konter ----------
-- Stok ritel untuk kasir (tanpa membuka tabel inventaris / harga modal).
create view retail_stock as
  select s.id as service_id, coalesce(sum(m.qty), 0) as qty
  from services s left join stock_moves m on m.item_id = s.stock_item_id
  where s.category = 'retail' and s.stock_item_id is not null and auth_role() in ('manager', 'cashier')
  group by s.id;

-- Nama anggota tim (kolom kasir di riwayat transaksi).
create view team_names as
  select id, full_name from profiles where role <> 'customer' and auth_role() in ('manager', 'cashier');

-- ---------- Tutup kasir harian ----------
create table cash_closings (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  cashier_id uuid references profiles (id) default auth.uid(),
  expected_cash bigint not null,
  physical_cash bigint not null check (physical_cash >= 0),
  difference bigint generated always as (physical_cash - expected_cash) stored,
  summary jsonb not null,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index cash_closings_date_idx on cash_closings (date);
alter table cash_closings enable row level security;
create policy front_read on cash_closings for select to authenticated using (auth_role() in ('manager', 'cashier'));
create trigger cash_closings_immutable before update or delete on cash_closings
  for each row execute function block_change();

-- Rekap per tanggal (Asia/Jakarta). Kas diharapkan = tunai penjualan + tunai top-up.
create function cash_summary(p_date date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb; t0 timestamptz := jkt(p_date, '00:00'); t1 timestamptz := jkt(p_date + 1, '00:00');
begin
  perform require_role('manager', 'cashier');
  with tx as (select * from transactions where created_at >= t0 and created_at < t1),
       ok as (select * from tx where voided_at is null),
       tp as (select * from deposit_topups where created_at >= t0 and created_at < t1)
  select jsonb_build_object(
    'date', p_date,
    'tx_count', (select count(*) from ok),
    'gross_total', (select coalesce(sum(total), 0) from ok),
    'discount_total', (select coalesce(sum(discount_amount), 0) from ok),
    'cash_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('cash', 'deposit_cash')),
    'qris_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('qris', 'deposit_qris')),
    'deposit_used', (select coalesce(sum(deposit_used), 0) from ok),
    'topup_cash', (select coalesce(sum(amount_paid), 0) from tp where method = 'cash'),
    'topup_qris', (select coalesce(sum(amount_paid), 0) from tp where method = 'qris'),
    'topup_credited', (select coalesce(sum(amount_credited), 0) from tp),
    'topup_count', (select count(*) from tp),
    'voided', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'created_at', created_at, 'total', total,
                                                             'reason', void_reason) order by created_at), '[]')
               from tx where voided_at is not null))
  into r;
  return r || jsonb_build_object('expected_cash', (r ->> 'cash_sales')::bigint + (r ->> 'topup_cash')::bigint);
end $$;

create function save_cash_closing(p_date date, p_physical_cash bigint, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare s jsonb; id uuid;
begin
  perform require_role('manager', 'cashier');
  if p_physical_cash is null or p_physical_cash < 0 then raise exception 'Isi kas fisik'; end if;
  s := cash_summary(p_date);
  insert into cash_closings (date, expected_cash, physical_cash, summary, note)
  values (p_date, (s ->> 'expected_cash')::bigint, p_physical_cash, s, coalesce(p_note, ''))
  returning cash_closings.id into id;
  return id;
end $$;

-- ---------- Impor pelanggan lama (manajer) ----------
-- p_rows: [{name, whatsapp, notes}] → {inserted, duplicates, errors:[{row, reason}]}
create function import_customers(p_rows jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare x jsonb; i int := 0; wa text; ins int := 0; dup int := 0; errs jsonb := '[]';
begin
  perform require_role('manager');
  for x in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if length(trim(coalesce(x ->> 'name', ''))) = 0 then
      errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'reason', 'Nama kosong')); continue;
    end if;
    wa := normalize_wa(x ->> 'whatsapp');
    if trim(coalesce(x ->> 'whatsapp', '')) <> '' and wa is null then
      errs := errs || jsonb_build_array(jsonb_build_object('row', i, 'reason', 'No. WhatsApp tidak valid')); continue;
    end if;
    if wa is not null and exists (select 1 from customers where whatsapp = wa) then dup := dup + 1; continue; end if;
    insert into customers (name, whatsapp, notes) values (trim(x ->> 'name'), wa, coalesce(trim(x ->> 'notes'), ''));
    ins := ins + 1;
  end loop;
  return jsonb_build_object('inserted', ins, 'duplicates', dup, 'errors', errs);
end $$;

-- Hanya dipanggil dari RPC; UI menghitung bentrok sendiri dari jadwal hari itu (src/lib/domain/schedule.ts).
revoke execute on function booking_conflicts(uuid, uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;

alter publication supabase_realtime add table customers, cash_closings;
