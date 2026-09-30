-- RPC: operasi atomik. Semua security definer + validasi peran di dalam.
-- Logika dicerminkan di src/lib/domain (cart.ts, slots.ts) — ubah keduanya bersamaan.

-- ---------- Booking ----------
-- ponytail: satu advisory lock per tanggal menyerialkan semua booking di hari itu; cukup untuk 1 toko,
-- pecah per resource/staf jika antrean booking mulai terasa.
create function lock_booking_day(d date) returns void language sql as $$
  select pg_advisory_xact_lock(hashtext('booking:' || d::text))
$$;

-- Rencana penempatan: per kategori 1 resource + 1 staf kosong. Null jika tidak muat.
create function plan_booking(p_date date, p_start int, p_service_ids uuid[], p_staff_pick jsonb, p_together boolean)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  g record; t int := p_start; a0 timestamptz; b0 timestamptz; res uuid; stf uuid; pick uuid;
  out jsonb := '[]';
begin
  for g in
    select s.category::text as cat, array_agg(s.id order by s.sort, s.name) as ids,
           sum(s.duration_min)::int as dur, bool_or(s.needs_pedicure) as pedi
    from services s
    where s.id = any (p_service_ids) and s.active and s.category <> 'retail'
    group by s.category
    order by s.category  -- barbershop dulu, lalu nail
  loop
    a0 := jkt(p_date, '00:00') + make_interval(mins => t);
    b0 := a0 + make_interval(mins => g.dur);

    select r.id into res from resources r
    where r.active and r.type::text = g.cat
      and not exists (select 1 from appointments x where x.resource_id = r.id and x.status <> 'cancelled'
                      and x.start_at < b0 and x.end_at > a0)
    order by (r.is_pedicure = g.pedi) desc, r.sort, r.name
    limit 1;
    if res is null then return null; end if;

    pick := nullif(coalesce(p_staff_pick, '{}') ->> g.cat, '')::uuid;
    select s.id into stf from staff s
    where s.active and s.category::text = g.cat and (pick is null or s.id = pick)
      and not exists (select 1 from appointments x where x.staff_id = s.id and x.status <> 'cancelled'
                      and x.start_at < b0 and x.end_at > a0)
    order by s.sort, s.name
    limit 1;
    if stf is null then return null; end if;

    out := out || jsonb_build_array(jsonb_build_object(
      'category', g.cat, 'service_ids', to_jsonb(g.ids), 'resource_id', res, 'staff_id', stf,
      'start_at', a0, 'duration_min', g.dur));
    if not p_together then t := t + g.dur; end if;
  end loop;
  return nullif(out, '[]');
end $$;

-- Slot 30 menit dalam jam buka. Hari ini: mulai ≥ sekarang + 30 menit. Maks 60 hari ke depan.
create function get_available_slots(p_date date, p_service_ids uuid[], p_staff_pick jsonb default '{}', p_together boolean default true)
returns setof text language plpgsql stable security definer set search_path = public as $$
declare
  st public_settings; open_m int; close_m int; total int; min_m int; t int;
begin
  if p_date < jkt_today() or p_date > jkt_today() + 60 then return; end if;
  select * into st from public_settings;
  open_m := extract(epoch from st.open_time)::int / 60;
  close_m := extract(epoch from st.close_time)::int / 60;

  select case when p_together then max(d) else sum(d) end into total
  from (select sum(duration_min) as d from services
        where id = any (p_service_ids) and active and category <> 'retail' group by category) x;
  if total is null then return; end if;

  min_m := open_m;
  if p_date = jkt_today() then
    min_m := greatest(open_m, (extract(epoch from (now() at time zone 'Asia/Jakarta')::time)::int / 60) + 30);
  end if;

  t := open_m;
  while t + total <= close_m loop
    if t >= min_m and plan_booking(p_date, t, p_service_ids, p_staff_pick, p_together) is not null then
      return next to_char(make_time(t / 60, t % 60, 0), 'HH24:MI');
    end if;
    t := t + 30;
  end loop;
end $$;

-- Booking online (anon/tamu dengan WA, atau pelanggan login). Menolak bentrok.
create function create_online_booking(
  p_date date, p_time text, p_service_ids uuid[], p_staff_pick jsonb default '{}', p_together boolean default true,
  p_name text default null, p_whatsapp text default null, p_notes text default '', p_captcha_token text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
-- Mengembalikan [{id, category, staff_name, start_at}] untuk layar "Booking terkonfirmasi" (anon tak bisa membaca appointments).
declare
  r app_role := auth_role(); cid uuid; wa text; plan jsonb; g jsonb; aid uuid; out jsonb := '[]';
  ip text := split_part(coalesce(current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1);
  rl_key text;
begin
  if auth.uid() is not null and r is distinct from 'customer' then
    raise exception 'Tim memakai jadwal admin';
  end if;
  -- Hook captcha: verifikasi p_captcha_token di sini sebelum lanjut (mis. Turnstile via pg_net / edge function).

  if exists (select 1 from unnest(p_service_ids) sid left join services s on s.id = sid
             where s.id is null or not s.active or s.category = 'retail') then
    raise exception 'Layanan tidak valid';
  end if;

  if r = 'customer' then
    cid := my_customer_id();
    rl_key := 'user:' || auth.uid();
  else
    wa := normalize_wa(p_whatsapp);
    if wa is null then raise exception 'No. WhatsApp tidak valid'; end if;
    if length(trim(coalesce(p_name, ''))) = 0 then raise exception 'Nama wajib diisi'; end if;
    rl_key := 'wa:' || wa;
  end if;

  -- Rate limit: 5 percobaan/jam per identitas, 20/jam per IP.
  if (select count(*) from booking_attempts where key = rl_key and created_at > now() - interval '1 hour') >= 5
     or (ip <> '' and (select count(*) from booking_attempts where key = 'ip:' || ip
                       and created_at > now() - interval '1 hour') >= 20) then
    raise exception 'Terlalu banyak percobaan booking, coba lagi nanti';
  end if;
  insert into booking_attempts (key) values (rl_key);
  if ip <> '' then insert into booking_attempts (key) values ('ip:' || ip); end if;

  perform lock_booking_day(p_date);
  if not exists (select 1 from get_available_slots(p_date, p_service_ids, p_staff_pick, p_together) s where s = p_time) then
    raise exception 'Slot sudah tidak tersedia';
  end if;
  plan := plan_booking(p_date, extract(epoch from p_time::time)::int / 60, p_service_ids, p_staff_pick, p_together);

  if cid is null then
    insert into customers (name, whatsapp, created_by) values (trim(p_name), wa, null)
    on conflict (whatsapp) do update set whatsapp = excluded.whatsapp
    returning id into cid;
  end if;

  for g in select * from jsonb_array_elements(plan) loop
    insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes, created_by)
    values (cid, (g ->> 'resource_id')::uuid, (g ->> 'staff_id')::uuid, (g ->> 'start_at')::timestamptz,
            (g ->> 'duration_min')::int, 'online', coalesce(p_notes, ''), auth.uid())
    returning id into aid;
    insert into appointment_services (appointment_id, service_id)
    select aid, x::uuid from jsonb_array_elements_text(g -> 'service_ids') x;
    out := out || jsonb_build_array(jsonb_build_object(
      'id', aid, 'category', g ->> 'category', 'start_at', g -> 'start_at',
      'staff_name', (select name from staff where id = (g ->> 'staff_id')::uuid)));
  end loop;
  return out;
end $$;

-- Booking admin: bentrok = peringatan lunak. Tanpa p_force, kembalikan daftar bentrok tanpa menyimpan.
create function create_booking_admin(
  p_resource_id uuid, p_staff_id uuid, p_start_at timestamptz, p_service_ids uuid[],
  p_customer_id uuid default null, p_name text default null, p_whatsapp text default null,
  p_source appt_source default 'admin', p_notes text default '', p_force boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  dur int; b0 timestamptz; conflicts jsonb; cid uuid := p_customer_id; wa text; aid uuid;
begin
  perform require_role('manager', 'cashier');
  if p_source = 'online' then raise exception 'Gunakan create_online_booking'; end if;
  if coalesce(array_length(p_service_ids, 1), 0) = 0 then raise exception 'Pilih minimal satu layanan'; end if;
  select coalesce(nullif(sum(duration_min), 0), 30) into dur from services where id = any (p_service_ids);
  b0 := p_start_at + make_interval(mins => dur);

  perform lock_booking_day((p_start_at at time zone 'Asia/Jakarta')::date);
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'start_at', a.start_at, 'end_at', a.end_at,
           'resource_id', a.resource_id, 'staff_id', a.staff_id) order by a.start_at), '[]')
  into conflicts from appointments a
  where a.status <> 'cancelled' and a.start_at < b0 and a.end_at > p_start_at
    and (a.resource_id = p_resource_id or a.staff_id = p_staff_id);

  if jsonb_array_length(conflicts) > 0 and not p_force then
    return jsonb_build_object('saved', false, 'conflicts', conflicts);
  end if;

  if cid is null and length(trim(coalesce(p_name, ''))) > 0 then
    wa := normalize_wa(p_whatsapp);
    if p_whatsapp is not null and trim(p_whatsapp) <> '' and wa is null then
      raise exception 'No. WhatsApp tidak valid';
    end if;
    if wa is not null then select id into cid from customers where whatsapp = wa; end if;
    if cid is null then
      insert into customers (name, whatsapp) values (trim(p_name), wa) returning id into cid;
    end if;
  end if;

  insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, notes)
  values (cid, p_resource_id, p_staff_id, p_start_at, dur, p_source, coalesce(p_notes, ''))
  returning id into aid;
  insert into appointment_services (appointment_id, service_id) select aid, unnest(p_service_ids);
  return jsonb_build_object('saved', true, 'appointment_id', aid, 'conflicts', conflicts);
end $$;

-- booked → arrived → in_service → completed. 'paid' hanya lewat checkout.
create function advance_appointment_status(p_id uuid) returns appt_status
language plpgsql security definer set search_path = public as $$
declare a appointments; nxt appt_status;
begin
  perform require_role('manager', 'cashier', 'staff');
  select * into a from appointments where id = p_id for update;
  if not found or (auth_role() = 'staff' and a.staff_id is distinct from my_staff_id()) then
    raise exception 'Booking tidak ditemukan';
  end if;
  nxt := case a.status when 'booked' then 'arrived' when 'arrived' then 'in_service'
                       when 'in_service' then 'completed' end;
  if nxt is null then raise exception 'Status % tidak bisa dimajukan', a.status; end if;
  update appointments set status = nxt where id = p_id;
  return nxt;
end $$;

create function update_customer_notes(p_customer_id uuid, p_notes text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier', 'staff');
  if auth_role() = 'staff' and not exists (
    select 1 from appointments where customer_id = p_customer_id and staff_id = my_staff_id()) then
    raise exception 'Akses ditolak' using errcode = '42501';
  end if;
  update customers set notes = coalesce(p_notes, '') where id = p_customer_id;
  if not found then raise exception 'Pelanggan tidak ditemukan'; end if;
end $$;

create function cancel_my_booking(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('customer');
  update appointments set status = 'cancelled'
  where id = p_id and customer_id = my_customer_id() and status = 'booked';
  if not found then raise exception 'Booking tidak bisa dibatalkan'; end if;
end $$;

-- ---------- Kasir ----------
-- payload: {customer_id?, items:[{service_id, staff_id?, appointment_id?}], use_deposit, method:'cash'|'qris'}
-- Harga, diskon, deposit & HPP dihitung ulang di sini — angka dari klien diabaikan.
create function checkout(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  st settings; lines jsonb; n int; cnt int; appt_ids uuid[]; cid uuid := nullif(p ->> 'customer_id', '')::uuid;
  sub bigint; base bigint; has_b boolean; has_n boolean; disc bigint := 0; total bigint; dep bigint := 0;
  method text := p ->> 'method'; meth pay_method; txid uuid; tiid uuid; l jsonb; share bigint;
  allocated bigint := 0; last_svc int; i int := 0;
begin
  perform require_role('manager', 'cashier');
  select * into st from settings;
  if method not in ('cash', 'qris') then raise exception 'Metode bayar tidak valid'; end if;
  n := coalesce(jsonb_array_length(p -> 'items'), 0);
  if n = 0 then raise exception 'Keranjang kosong'; end if;

  -- Kunci booking terkait: cegah checkout ganda.
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
    perform 1 from customers where id = cid for update;  -- serialkan pemakaian deposit
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

  insert into transactions (customer_id, subtotal, discount_amount, discount_label, total, deposit_used,
                            paid_amount, payment_method, cashier_id)
  values (cid, sub, disc, case when disc > 0 then 'Groom & Bloom ' || st.bundle_pct || '%' else '' end,
          total, dep, total - dep, meth, auth.uid())
  returning id into txid;

  for l in select * from jsonb_array_elements(lines) loop
    i := i + 1;
    share := 0;
    if disc > 0 and l ->> 'category' <> 'retail' then
      -- porsi proporsional (dibulatkan ke bawah); sisa pembulatan ke item layanan terakhir
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

create function topup_deposit(p_customer_id uuid, p_method text, p_package_id uuid default null,
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
  end if;
  insert into deposit_topups (customer_id, package_id, amount_paid, amount_credited, method)
  values (p_customer_id, p_package_id, p_amount_paid, coalesce(p_amount_credited, p_amount_paid), p_method::pay_method)
  returning deposit_topups.id into id;
  return id;
end $$;

-- Void: tandai, kembalikan stok, booking kembali ke 'completed'. Deposit otomatis kembali (view mengabaikan void).
create function void_transaction(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan void wajib diisi'; end if;
  update transactions set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null;
  if not found then raise exception 'Transaksi tidak ditemukan atau sudah di-void'; end if;
  insert into stock_moves (item_id, qty, type, transaction_id, note)
  select item_id, -qty, 'adjust', p_id, 'Void: ' || trim(p_reason) from stock_moves where transaction_id = p_id;
  update appointments set status = 'completed'
  where status = 'paid' and id in (select appointment_id from transaction_items where transaction_id = p_id);
end $$;

-- ---------- Inventaris ----------
-- p_lines: [{item_id, counted}] → selisih dicatat sebagai mutasi 'opname'.
create function save_stock_opname(p_lines jsonb, p_note text default '') returns uuid
language plpgsql security definer set search_path = public as $$
declare oid uuid;
begin
  perform require_role('manager');
  insert into stock_opnames (note) values (coalesce(p_note, '')) returning id into oid;
  insert into stock_moves (item_id, qty, type, opname_id, note)
  select x.item_id, x.counted - coalesce((select sum(qty) from stock_moves m where m.item_id = x.item_id), 0),
         'opname', oid, 'Stok opname'
  from jsonb_to_recordset(p_lines) as x(item_id uuid, counted numeric)
  where x.counted <> coalesce((select sum(qty) from stock_moves m where m.item_id = x.item_id), 0);
  return oid;
end $$;

-- ---------- SOP ----------
create function record_sop_stage(p_group_id uuid, p_stage sop_stage) returns void
language plpgsql security definer set search_path = public as $$
declare d date := jkt_today(); stages sop_stage[] := enum_range(null::sop_stage); pos int;
begin
  perform require_role('manager', 'staff');
  pos := array_position(stages, p_stage);
  if pos > 1 and not exists (select 1 from sop_logs where date = d and group_id = p_group_id and stage = stages[pos - 1]) then
    raise exception 'Selesaikan tahap % dulu', stages[pos - 1];
  end if;
  insert into sop_logs (date, group_id, stage, done_by) values (d, p_group_id, p_stage, auth.uid());
exception when unique_violation then
  raise exception 'Tahap ini sudah dicatat';
end $$;

create function undo_sop_stage(p_group_id uuid, p_stage sop_stage, p_date date default null) returns void
language plpgsql security definer set search_path = public as $$
declare d date := coalesce(p_date, jkt_today());
begin
  perform require_role('manager', 'staff');
  if exists (select 1 from sop_logs where date = d and group_id = p_group_id and stage > p_stage) then
    raise exception 'Batalkan tahap berikutnya dulu';
  end if;
  delete from sop_logs where date = d and group_id = p_group_id and stage = p_stage
    and (auth_role() = 'manager' or done_by = auth.uid());
  if not found then raise exception 'Log tidak ditemukan'; end if;
end $$;

create function approve_sop_day(p_date date) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  if (select count(*) from sop_logs l join sop_tool_groups g on g.id = l.group_id and g.active where l.date = p_date)
     < (select count(*) * 3 from sop_tool_groups where active) then
    raise exception 'Checklist belum lengkap';
  end if;
  insert into sop_approvals (date, approved_by) values (p_date, auth.uid());
end $$;

-- Helper internal: tidak dipanggil langsung dari API.
revoke execute on function plan_booking(date, int, uuid[], jsonb, boolean), lock_booking_day(date)
  from public, anon, authenticated;

-- ---------- Realtime ----------
alter publication supabase_realtime add table appointments, appointment_services, transactions,
  deposit_topups, stock_moves, sop_logs;
