-- Helper peran, trigger integritas, dan view turunan.

-- ---------- Helper ----------
-- Peran pengguna saat ini; null jika anon atau akun belum diaktifkan.
create function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active
$$;

create function my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select staff_id from profiles where id = auth.uid() and active
$$;

create function my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_id from profiles where id = auth.uid() and active
$$;

create function require_role(variadic roles app_role[]) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if auth_role() is null or not (auth_role() = any (roles)) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
end $$;

-- 08xx / +62 / 8xx → 62xxx. Null jika tidak valid.
create function normalize_wa(raw text) returns text
language sql immutable as $$
  with d as (select regexp_replace(coalesce(raw, ''), '\D', '', 'g') as n)
  select case
    when n ~ '^62[0-9]{8,13}$' then n
    when n ~ '^0[0-9]{8,13}$' then '62' || substr(n, 2)
    when n ~ '^8[0-9]{7,12}$' then '62' || n
  end from d
$$;

-- Jam dinding Asia/Jakarta → timestamptz
create function jkt(d date, t time) returns timestamptz
language sql immutable as $$ select (d + t) at time zone 'Asia/Jakarta' $$;

create function jkt_today() returns date
language sql stable as $$ select (now() at time zone 'Asia/Jakarta')::date $$;

-- ---------- Trigger ----------
create function set_end_at() returns trigger language plpgsql as $$
begin
  new.end_at := new.start_at + make_interval(mins => new.duration_min);
  return new;
end $$;
create trigger appointments_end_at before insert or update of start_at, duration_min on appointments
  for each row execute function set_end_at();

-- Status 'paid' hanya boleh diset oleh checkout().
create function guard_appt_paid() returns trigger language plpgsql as $$
begin
  if new.status = 'paid' and old.status is distinct from 'paid'
     and current_setting('app.via_checkout', true) is distinct from 'on' then
    raise exception 'Status paid hanya lewat checkout';
  end if;
  return new;
end $$;
create trigger appointments_paid_guard before insert or update of status on appointments
  for each row execute function guard_appt_paid();

-- Transaksi immutable: hanya voided_at/void_reason yang boleh berubah, sekali.
create function guard_tx_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Transaksi tidak bisa dihapus; gunakan void'; end if;
  if old.voided_at is not null then raise exception 'Transaksi sudah di-void'; end if;
  if (to_jsonb(new) - 'voided_at' - 'void_reason') <> (to_jsonb(old) - 'voided_at' - 'void_reason') then
    raise exception 'Transaksi immutable';
  end if;
  return new;
end $$;
create trigger transactions_immutable before update or delete on transactions
  for each row execute function guard_tx_immutable();

create function block_change() returns trigger language plpgsql as $$
begin raise exception '% immutable', tg_table_name; end $$;
create trigger transaction_items_immutable before update or delete on transaction_items
  for each row execute function block_change();
create trigger transaction_item_costs_immutable before update or delete on transaction_item_costs
  for each row execute function block_change();
create trigger stock_moves_immutable before update or delete on stock_moves
  for each row execute function block_change();
create trigger deposit_topups_immutable before update or delete on deposit_topups
  for each row execute function block_change();

-- Non-manajer tidak boleh mengubah peran/aktif/tautan profilnya sendiri.
-- Sengaja BUKAN security definer: current_user harus peran pemanggil, bukan pemilik fungsi.
create function guard_profile() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and auth_role() is distinct from 'manager'
     and (new.role, new.active, new.staff_id, new.customer_id, new.email)
         is distinct from (old.role, old.active, old.staff_id, old.customer_id, old.email) then
    raise exception 'Hanya manajer yang bisa mengubah peran akun' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles for each row execute function guard_profile();

-- Log SOP terkunci setelah hari itu diotorisasi.
create function guard_sop_locked() returns trigger language plpgsql as $$
begin
  if exists (select 1 from sop_approvals where date = coalesce(old.date, new.date)) then
    raise exception 'Checklist tanggal ini sudah diotorisasi';
  end if;
  return coalesce(new, old);
end $$;
create trigger sop_logs_locked before insert or update or delete on sop_logs
  for each row execute function guard_sop_locked();

-- Pendaftaran: metadata {signup:'team', invite_code, role, full_name} → akun tim nonaktif menunggu manajer.
-- Selain itu → akun pelanggan, ditautkan ke baris customers dengan email sama (atau dibuat baru).
create function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  nm text := coalesce(nullif(trim(m ->> 'full_name'), ''), split_part(new.email, '@', 1));
  cid uuid;
begin
  if m ->> 'signup' = 'team' then
    if (m ->> 'invite_code') is distinct from (select invite_code from settings) then
      raise exception 'Kode undangan tidak valid';
    end if;
    if (m ->> 'role') not in ('cashier', 'staff') then
      raise exception 'Peran tidak valid';
    end if;
    insert into profiles (id, full_name, email, role, active)
    values (new.id, nm, new.email, (m ->> 'role')::app_role, false);
  else
    select c.id into cid from customers c
    where lower(c.email) = lower(new.email)
      and not exists (select 1 from profiles p where p.customer_id = c.id);
    if cid is null then
      insert into customers (name, email, created_by) values (nm, new.email, null) returning id into cid;
    end if;
    insert into profiles (id, full_name, email, role, customer_id)
    values (new.id, nm, new.email, 'customer', cid);
  end if;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- View publik (tanpa HPP / data sensitif) ----------
create view public_services as
  select id, name, category, price, duration_min, needs_pedicure, upsell_service_id, sort
  from services where active;

create view public_staff as
  select id, name, category, sort from staff where active;

create view public_deposit_packages as
  select id, name, amount_paid, amount_credited from deposit_packages where active;

create view public_settings as
  select shop_name, shop_address, shop_whatsapp, shop_instagram, open_time, close_time,
         bundle_pct, churn_weeks, wa_followup_template
  from settings;

-- ---------- View turunan (ikut RLS pemanggil) ----------
create view customer_stats with (security_invoker = true) as
  select c.id as customer_id,
         coalesce(t.ltv, 0)::bigint as lifetime_value,
         coalesce(t.visits, 0)::int as visit_count,
         t.last_at as last_visit_at,
         (coalesce(d.credited, 0) - coalesce(t.used, 0))::bigint as deposit_balance,
         coalesce(t.last_at < now() - make_interval(weeks => (select churn_weeks from public_settings)), false) as is_churn
  from customers c
  left join (
    select customer_id, sum(total) as ltv, count(*) as visits, max(created_at) as last_at, sum(deposit_used) as used
    from transactions where voided_at is null group by customer_id
  ) t on t.customer_id = c.id
  left join (
    select customer_id, sum(amount_credited) as credited from deposit_topups group by customer_id
  ) d on d.customer_id = c.id
  where auth_role() in ('manager', 'cashier') or c.id = my_customer_id();

create view stock_levels with (security_invoker = true) as
  select i.id as item_id, i.name, i.kind, i.unit, i.reorder_at,
         coalesce(sum(m.qty), 0) as qty,
         case when coalesce(sum(m.qty), 0) <= i.reorder_at then 'reorder'
              when coalesce(sum(m.qty), 0) <= i.reorder_at * 1.5 then 'low'
              else 'ok' end as status
  from inventory_items i left join stock_moves m on m.item_id = i.id
  group by i.id;

-- Saldo deposit untuk dipakai di dalam RPC (tanpa RLS).
create function deposit_balance_of(cid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce((select sum(amount_credited) from deposit_topups where customer_id = cid), 0)
       - coalesce((select sum(deposit_used) from transactions where customer_id = cid and voided_at is null), 0)
$$;

-- HPP layanan saat ini = Σ qty × unit_cost; ritel = unit_cost item stok.
create function service_hpp(sid uuid) returns bigint
language sql stable security definer set search_path = public as $$
  select case when s.category = 'retail'
    then coalesce((select unit_cost from inventory_items where id = s.stock_item_id), 0)
    else coalesce(round((select sum(sm.qty * i.unit_cost) from service_materials sm
                         join inventory_items i on i.id = sm.item_id where sm.service_id = s.id)), 0)::bigint
  end from services s where s.id = sid
$$;

-- Komisi bulanan. Manajer: semua staf. Kapster: hanya dirinya.
create function staff_commission_monthly(month date)
returns table (staff_id uuid, staff_name text, category staff_category, service_count int,
               net_revenue bigint, hpp_total bigint, commission bigint, subsidy bigint, total_pay bigint)
language plpgsql stable security definer set search_path = public as $$
declare
  st settings;
  m0 timestamptz := jkt(date_trunc('month', month)::date, '00:00');
  m1 timestamptz := jkt((date_trunc('month', month) + interval '1 month')::date, '00:00');
begin
  perform require_role('manager', 'staff');
  select * into st from settings;
  return query
  with items as (
    select ti.staff_id, ti.net_amount, coalesce(c.hpp, 0) as hpp
    from transaction_items ti
    join transactions t on t.id = ti.transaction_id
    left join transaction_item_costs c on c.transaction_item_id = ti.id
    where t.voided_at is null and ti.category <> 'retail'
      and t.created_at >= m0 and t.created_at < m1
  ), per as (
    select s.id, s.name, s.category,
           count(i.staff_id)::int as n,
           coalesce(sum(i.net_amount), 0)::bigint as net,
           coalesce(sum(i.hpp), 0)::bigint as hpp,
           coalesce(sum(greatest(0, i.net_amount - i.hpp) * coalesce(s.commission_pct_override, st.commission_pct) / 100.0), 0) as comm
    from staff s left join items i on i.staff_id = s.id
    where s.active and (auth_role() = 'manager' or s.id = my_staff_id())
    group by s.id
  )
  select p.id, p.name, p.category, p.n, p.net, p.hpp,
         round(p.comm)::bigint,
         greatest(0, st.min_monthly_pay - round(p.comm))::bigint,
         greatest(st.min_monthly_pay, round(p.comm))::bigint
  from per p order by p.category, p.name;
end $$;
