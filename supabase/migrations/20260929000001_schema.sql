-- Groom & Bloom — skema lengkap (Fase 1–3).
-- Uang = bigint rupiah. Nilai turunan (saldo, stok, LTV, komisi) dihitung di view/fungsi, tidak disimpan.

create extension if not exists pgcrypto;

-- ---------- Enum ----------
create type app_role        as enum ('manager', 'cashier', 'staff', 'customer');
create type staff_category  as enum ('barbershop', 'nail');
create type service_category as enum ('barbershop', 'nail', 'retail');
create type appt_status     as enum ('booked', 'arrived', 'in_service', 'completed', 'paid', 'cancelled');
create type appt_source     as enum ('admin', 'walk_in', 'whatsapp', 'online');
create type pay_method      as enum ('cash', 'qris', 'deposit', 'deposit_cash', 'deposit_qris');
create type item_kind       as enum ('consumable', 'retail');
create type stock_move_type as enum ('in', 'use', 'sale', 'opname', 'adjust');
create type sop_stage       as enum ('wash', 'soak', 'autoclave');

-- ---------- Pengaturan ----------
create table settings (
  id boolean primary key default true check (id),
  bundle_pct int not null default 10 check (bundle_pct between 10 and 15),
  churn_weeks int not null default 4 check (churn_weeks > 0),
  wa_followup_template text not null default 'Halo {nama}! Sudah cukup lama nih belum mampir ke Groom & Bloom. Minggu ini masih ada slot kosong — mau kami bantu booking?',
  commission_pct int not null default 40 check (commission_pct between 0 and 100),
  min_monthly_pay bigint not null default 1200000 check (min_monthly_pay >= 0),
  aov_target_barbershop bigint not null default 120000,
  aov_target_nail bigint not null default 200000,
  retail_ratio_min int not null default 15,
  retail_ratio_max int not null default 20,
  utilization_target int not null default 40,
  invite_code text not null default 'GB-2026' check (length(invite_code) >= 6),
  open_time time not null default '09:00',
  close_time time not null default '21:00' check (close_time > open_time),
  maint_default_interval_days int not null default 14 check (maint_default_interval_days > 0),
  shop_name text not null default 'Groom & Bloom',
  shop_address text not null default '',
  shop_whatsapp text not null default '',
  shop_instagram text not null default '',
  updated_at timestamptz not null default now()
);
insert into settings default values;

-- ---------- Orang ----------
create table staff (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category staff_category not null,
  commission_pct_override int check (commission_pct_override between 0 and 100),
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table customers (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  whatsapp text unique check (whatsapp ~ '^62[0-9]{8,13}$'),
  email text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create unique index customers_email_key on customers (lower(email));

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text,
  phone text,
  role app_role not null default 'customer',
  staff_id uuid unique references staff (id) on delete set null,
  customer_id uuid unique references customers (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  -- akun kapster aktif wajib tertaut ke satu baris staff
  constraint staff_needs_link check (role <> 'staff' or not active or staff_id is not null)
);

-- ---------- Katalog & sumber daya ----------
create table resources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type staff_category not null,
  is_pedicure boolean not null default false,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table inventory_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind item_kind not null,
  unit text not null default 'pcs',
  unit_cost bigint not null default 0 check (unit_cost >= 0),
  reorder_at numeric not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category service_category not null,
  price bigint not null check (price >= 0),
  duration_min int not null default 0 check (duration_min >= 0),
  needs_pedicure boolean not null default false, -- prioritaskan resource is_pedicure
  upsell_service_id uuid references services (id) on delete set null,
  stock_item_id uuid references inventory_items (id) on delete set null,
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  check (category = 'retail' or duration_min > 0),
  check (upsell_service_id is distinct from id)
);

create table service_materials (
  id uuid primary key default gen_random_uuid(),
  service_id uuid not null references services (id) on delete cascade,
  item_id uuid not null references inventory_items (id) on delete restrict,
  qty numeric not null check (qty > 0),
  unique (service_id, item_id)
);

-- ---------- Jadwal ----------
create table appointments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers (id) on delete set null, -- null = walk-in anonim
  resource_id uuid not null references resources (id),
  staff_id uuid references staff (id),
  start_at timestamptz not null,
  duration_min int not null check (duration_min > 0),
  end_at timestamptz not null, -- diisi trigger (timestamptz + interval tidak immutable → tak bisa generated)
  status appt_status not null default 'booked',
  source appt_source not null default 'admin',
  notes text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index appointments_start_idx on appointments (start_at);
create index appointments_staff_idx on appointments (staff_id, start_at);

create table appointment_services (
  appointment_id uuid not null references appointments (id) on delete cascade,
  service_id uuid not null references services (id),
  primary key (appointment_id, service_id)
);

-- ---------- Kasir & deposit ----------
create table transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references customers (id),
  subtotal bigint not null check (subtotal >= 0),
  discount_amount bigint not null default 0 check (discount_amount >= 0),
  discount_label text not null default '',
  total bigint not null check (total >= 0),
  deposit_used bigint not null default 0 check (deposit_used >= 0),
  paid_amount bigint not null check (paid_amount >= 0),
  payment_method pay_method not null,
  cashier_id uuid references profiles (id) default auth.uid(),
  voided_at timestamptz,
  void_reason text,
  created_at timestamptz not null default now(),
  check (total = subtotal - discount_amount and total = deposit_used + paid_amount),
  check ((voided_at is null) = (void_reason is null))
);
create index transactions_created_idx on transactions (created_at);
create index transactions_customer_idx on transactions (customer_id);

create table transaction_items (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references transactions (id),
  service_id uuid references services (id) on delete set null,
  appointment_id uuid references appointments (id) on delete set null,
  staff_id uuid references staff (id),
  -- snapshot
  name text not null,
  category service_category not null,
  price bigint not null,
  discount_share bigint not null default 0,
  net_amount bigint not null,
  check (net_amount = price - discount_share)
);
create index transaction_items_tx_idx on transaction_items (transaction_id);

-- Snapshot HPP per item. Tabel terpisah (khusus manajer) supaya kasir bisa membaca struk tanpa melihat harga modal.
create table transaction_item_costs (
  transaction_item_id uuid primary key references transaction_items (id),
  hpp bigint not null check (hpp >= 0)
);

create table deposit_packages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount_paid bigint not null check (amount_paid > 0),
  amount_credited bigint not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (amount_credited >= amount_paid)
);

create table deposit_topups (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  package_id uuid references deposit_packages (id) on delete set null,
  amount_paid bigint not null check (amount_paid > 0),
  amount_credited bigint not null,
  method pay_method not null check (method in ('cash', 'qris')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  check (amount_credited >= amount_paid)
);
create index deposit_topups_customer_idx on deposit_topups (customer_id);

-- ---------- Inventaris ----------
create table stock_opnames (
  id uuid primary key default gen_random_uuid(),
  counted_by uuid default auth.uid(),
  note text not null default '',
  created_at timestamptz not null default now()
);

create table stock_moves (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references inventory_items (id),
  qty numeric not null check (qty <> 0),
  type stock_move_type not null,
  transaction_id uuid references transactions (id),
  opname_id uuid references stock_opnames (id),
  note text not null default '',
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid()
);
create index stock_moves_item_idx on stock_moves (item_id);

-- ---------- SOP & fasilitas ----------
create table sop_tool_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  sort int not null default 0,
  active boolean not null default true
);

create table sop_logs (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  group_id uuid not null references sop_tool_groups (id),
  stage sop_stage not null,
  done_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (date, group_id, stage)
);

create table sop_approvals (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  approved_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table maintenance_tasks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  interval_days int not null default 14 check (interval_days > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table maintenance_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references maintenance_tasks (id),
  done_by uuid default auth.uid(),
  note text not null default '',
  created_at timestamptz not null default now()
);

-- Rate limit booking online (per no. WA / IP)
create table booking_attempts (
  id bigint generated always as identity primary key,
  key text not null,
  created_at timestamptz not null default now()
);
create index booking_attempts_key_idx on booking_attempts (key, created_at);
