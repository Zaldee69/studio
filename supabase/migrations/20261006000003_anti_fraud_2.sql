-- Anti-fraud tahap 2:
--  1. Audit log otomatis (trigger): siapa mengubah apa & kapan — booking, pelanggan, void, top-up, tutup kasir,
--     harga layanan, staf, peran akun. Hanya manajer yang bisa membaca; tidak bisa diubah/dihapus.
--  2. Layanan yang sudah dikerjakan (Dilayani/Selesai) tidak bisa dibatalkan/dimundurkan kasir; selesai > 30 menit
--     tanpa dibayar → notifikasi manajer.
--  3. QRIS wajib No. referensi (bukti bayar), tidak boleh dipakai dua kali dalam 7 hari.
--  4. fraud_overview(): ringkasan kecurigaan untuk halaman Audit manajer.

-- ---------- 1. Audit log ----------
create table audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid default auth.uid(),             -- null = sistem (cron/trigger tanpa sesi)
  entity text not null,
  entity_id uuid,
  action text not null,                       -- insert | update | delete
  changes jsonb not null default '{}'         -- update: {kolom: [lama, baru]}; insert/delete: isi baris
);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_entity_idx on audit_log (entity, entity_id);
alter table audit_log enable row level security;
create policy manager_read on audit_log for select to authenticated using (auth_role() = 'manager');
create trigger audit_log_immutable before update or delete on audit_log for each row execute function block_change();
alter publication supabase_realtime add table audit_log;

-- Argumen trigger = kolom yang diabaikan (cap waktu otomatis dsb.).
create function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  ch jsonb := '{}'; k text;
begin
  if tg_op = 'UPDATE' then
    for k in select jsonb_object_keys(n) loop
      if not (k = any (coalesce(tg_argv, '{}'::text[]))) and (o -> k) is distinct from (n -> k) then
        ch := ch || jsonb_build_object(k, jsonb_build_array(o -> k, n -> k));
      end if;
    end loop;
    if ch = '{}' then return null; end if;
  else
    ch := coalesce(n, o);
  end if;
  insert into audit_log (entity, entity_id, action, changes)
  values (tg_table_name, (coalesce(n, o) ->> 'id')::uuid, lower(tg_op), ch);
  return null;
end $$;

create trigger audit_appointments after update on appointments for each row execute function
  audit_row('status_changed_at', 'status_changed_by', 'arrived_at', 'service_started_at', 'service_ended_at', 'change_requested_at');
create trigger audit_customers after update or delete on customers for each row execute function audit_row();
create trigger audit_transactions after update on transactions for each row execute function audit_row();
create trigger audit_topups after insert on deposit_topups for each row execute function audit_row();
create trigger audit_closings after insert on cash_closings for each row execute function audit_row();
create trigger audit_services after update or delete on services for each row execute function audit_row();
create trigger audit_staff after update or delete on staff for each row execute function audit_row();
create trigger audit_profiles after update on profiles for each row execute function audit_row();

-- Umpan audit dengan nama pelaku (security_invoker: tetap tunduk RLS manajer).
create view audit_feed with (security_invoker = true) as
  select a.*, coalesce(p.full_name, 'Sistem') as actor_name, p.role::text as actor_role
  from audit_log a left join profiles p on p.id = a.actor;

-- ---------- 2. Layanan yang sudah dikerjakan ----------
create function guard_served_appt() returns trigger language plpgsql set search_path = public as $$
begin
  if old.status in ('in_service', 'completed') and new.status in ('booked', 'arrived', 'cancelled', 'no_show', 'pending_review')
     and auth_role() = 'cashier' then
    raise exception 'Layanan sudah dikerjakan — kasir tidak bisa membatalkan/memundurkan. Proses bayar di kasir atau minta manajer.';
  end if;
  return new;
end $$;
create trigger appointments_guard_served before update of status on appointments
  for each row execute function guard_served_appt();

create function unpaid_completed_alerts() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into notifications (target_role, kind, payload)
  select 'manager', 'unpaid_completed', jsonb_build_object('appointment_id', a.id, 'customer', coalesce(c.name, 'Walk-in'),
           'staff', s.name, 'since', a.status_changed_at)
  from appointments a left join customers c on c.id = a.customer_id left join staff s on s.id = a.staff_id
  where a.status = 'completed' and a.status_changed_at < now() - interval '30 minutes'
    and a.status_changed_at > now() - interval '2 days'
    and not exists (select 1 from notifications x where x.kind = 'unpaid_completed' and x.payload ->> 'appointment_id' = a.id::text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function unpaid_completed_alerts() from public, anon, authenticated;
select cron.schedule('gb-unpaid-completed', '*/10 * * * *', $$select public.unpaid_completed_alerts()$$);

-- ---------- 3. QRIS: No. referensi ----------
alter table transactions add column qris_ref text;
alter table deposit_topups add column qris_ref text;
create index transactions_qris_ref_idx on transactions (qris_ref) where qris_ref is not null;
create index deposit_topups_qris_ref_idx on deposit_topups (qris_ref) where qris_ref is not null;

create function check_qris_ref() returns trigger language plpgsql set search_path = public as $$
declare r jsonb := to_jsonb(new); is_qris boolean;  -- dua tabel, nama kolom metode berbeda
begin
  is_qris := case tg_table_name
    when 'transactions' then r ->> 'payment_method' in ('qris', 'deposit_qris') and (r ->> 'paid_amount')::bigint > 0
    else r ->> 'method' = 'qris' end;
  if not is_qris then new.qris_ref := null; return new; end if;
  if auth.uid() is null then return new; end if;  -- data sistem (seed/impor) tanpa sesi tim
  new.qris_ref := upper(regexp_replace(coalesce(new.qris_ref, ''), '[\s-]', '', 'g'));
  if new.qris_ref !~ '^[A-Z0-9]{4,40}$' then
    raise exception 'Isi No. referensi QRIS (min. 4 huruf/angka, dari bukti bayar pelanggan atau notifikasi bank)';
  end if;
  if exists (select 1 from transactions t where t.qris_ref = new.qris_ref and t.voided_at is null and t.created_at > now() - interval '7 days')
     or exists (select 1 from deposit_topups d where d.qris_ref = new.qris_ref and d.created_at > now() - interval '7 days') then
    raise exception 'No. referensi QRIS % sudah dipakai transaksi lain', new.qris_ref;
  end if;
  return new;
end $$;
create trigger transactions_qris_ref before insert on transactions for each row execute function check_qris_ref();
create trigger deposit_topups_qris_ref before insert on deposit_topups for each row execute function check_qris_ref();

-- checkout(): teruskan p.qris_ref ke transaksi (definisi terakhir; hanya kolom insert yang ditambah)
do $$
declare def text := pg_get_functiondef('public.checkout(jsonb)'::regprocedure);
  a text := 'paid_amount, payment_method, cashier_id, cash_received)';
  b text := 'total, dep, total - dep, meth, auth.uid(), received)';
begin
  if position(a in def) = 0 or position(b in def) = 0 then raise exception 'Struktur checkout() berubah — perbarui migrasi ini'; end if;
  def := replace(def, a, 'paid_amount, payment_method, cashier_id, cash_received, qris_ref)');
  def := replace(def, b, 'total, dep, total - dep, meth, auth.uid(), received, p ->> ''qris_ref'')');
  execute def;
end $$;

drop function topup_deposit(uuid, text, uuid, bigint, bigint);
create function topup_deposit(p_customer_id uuid, p_method text, p_package_id uuid default null,
                              p_amount_paid bigint default null, p_amount_credited bigint default null, p_qris_ref text default null)
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
      p_amount_credited := p_amount_paid;  -- kasir: bonus hanya lewat paket resmi
    end if;
  end if;
  insert into deposit_topups (customer_id, package_id, amount_paid, amount_credited, method, qris_ref)
  values (p_customer_id, p_package_id, p_amount_paid, p_amount_credited, p_method::pay_method, p_qris_ref)
  returning deposit_topups.id into id;
  return id;
end $$;

-- ---------- 4. Ringkasan kecurigaan (manajer) ----------
create function fraud_overview(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare t0 timestamptz := jkt(p_from, '00:00'); t1 timestamptz := jkt(p_to + 1, '00:00');
begin
  perform require_role('manager');
  return jsonb_build_object(
    -- layanan selesai yang belum dibayar (semua yang masih terbuka)
    'unpaid', (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'customer', coalesce(c.name, 'Walk-in'), 'staff', s.name,
                 'start_at', a.start_at, 'since', a.status_changed_at) order by a.status_changed_at), '[]')
               from appointments a left join customers c on c.id = a.customer_id left join staff s on s.id = a.staff_id
               where a.status = 'completed'),
    -- tutup kasir per tanggal: penutupan pertama (hitungan kasir) & terakhir (koreksi), jumlah penutupan
    'closings', (select coalesce(jsonb_agg(x order by x ->> 'date' desc), '[]') from (
                   select jsonb_build_object('date', cl.date, 'count', count(*),
                     'cashier', (array_agg(p.full_name order by cl.created_at))[1],
                     'first_diff', (array_agg(cl.difference order by cl.created_at))[1],
                     'last_diff', (array_agg(cl.difference order by cl.created_at desc))[1],
                     'expected', (array_agg(cl.expected_cash order by cl.created_at desc))[1]) x
                   from cash_closings cl left join profiles p on p.id = cl.cashier_id
                   where cl.date between p_from and p_to group by cl.date) q),
    'voids', (select coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'created_at', t.created_at, 'voided_at', t.voided_at,
                'total', t.total, 'reason', t.void_reason, 'cashier', pc.full_name,
                'by', (select f.actor_name from audit_feed f where f.entity = 'transactions' and f.entity_id = t.id
                         and f.changes ? 'voided_at' order by f.at desc limit 1)) order by t.voided_at desc), '[]')
              from transactions t left join profiles pc on pc.id = t.cashier_id
              where t.voided_at >= t0 and t.voided_at < t1),
    -- pembatalan & pemunduran status booking oleh tim (bukan pelanggan)
    'cancels', (select coalesce(jsonb_agg(jsonb_build_object('at', f.at, 'by', f.actor_name, 'appointment_id', f.entity_id,
                  'from', f.changes -> 'status' ->> 0, 'to', f.changes -> 'status' ->> 1,
                  'reason', a.cancel_reason, 'customer', coalesce(c.name, 'Walk-in')) order by f.at desc), '[]')
                from audit_feed f join appointments a on a.id = f.entity_id left join customers c on c.id = a.customer_id
                where f.entity = 'appointments' and f.at >= t0 and f.at < t1 and f.actor_role in ('manager', 'cashier')
                  and f.changes ? 'status'
                  and (f.changes -> 'status' ->> 1 in ('cancelled', 'no_show')
                       or array_position(array['booked', 'arrived', 'in_service', 'completed'], f.changes -> 'status' ->> 1)
                          < array_position(array['booked', 'arrived', 'in_service', 'completed'], f.changes -> 'status' ->> 0))),
    'staff_changes', (select coalesce(jsonb_agg(jsonb_build_object('at', f.at, 'by', f.actor_name, 'appointment_id', f.entity_id,
                        'from', s0.name, 'to', s1.name, 'customer', coalesce(c.name, 'Walk-in')) order by f.at desc), '[]')
                      from audit_feed f join appointments a on a.id = f.entity_id left join customers c on c.id = a.customer_id
                      left join staff s0 on s0.id = (f.changes -> 'staff_id' ->> 0)::uuid
                      left join staff s1 on s1.id = (f.changes -> 'staff_id' ->> 1)::uuid
                      where f.entity = 'appointments' and f.changes ? 'staff_id' and f.at >= t0 and f.at < t1),
    'qris', (select coalesce(jsonb_agg(q order by q ->> 'at' desc), '[]') from (
               select jsonb_build_object('at', t.created_at, 'kind', 'Transaksi', 'amount', t.paid_amount, 'ref', t.qris_ref,
                        'cashier', p.full_name, 'voided', t.voided_at is not null) q
               from transactions t left join profiles p on p.id = t.cashier_id
               where t.payment_method::text in ('qris', 'deposit_qris') and t.paid_amount > 0 and t.created_at >= t0 and t.created_at < t1
               union all
               select jsonb_build_object('at', d.created_at, 'kind', 'Top-up', 'amount', d.amount_paid, 'ref', d.qris_ref,
                        'cashier', p.full_name, 'voided', false)
               from deposit_topups d left join profiles p on p.id = d.created_by
               where d.method = 'qris' and d.created_at >= t0 and d.created_at < t1) z),
    'manual_topups', (select coalesce(jsonb_agg(jsonb_build_object('at', d.created_at, 'customer', c.name, 'paid', d.amount_paid,
                        'credited', d.amount_credited, 'by', p.full_name) order by d.created_at desc), '[]')
                      from deposit_topups d join customers c on c.id = d.customer_id left join profiles p on p.id = d.created_by
                      where d.package_id is null and d.created_at >= t0 and d.created_at < t1)
  );
end $$;
