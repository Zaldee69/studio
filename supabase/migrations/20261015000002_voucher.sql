-- Kode voucher untuk booking online (dibuat manajer):
--   • potongan persen (≤100) atau nominal; berlaku untuk satu kategori atau semua layanan (bukan ritel);
--   • batas: periode berlaku, kuota total, sekali per pelanggan, minimal belanja (dari layanan yang memenuhi syarat);
--   • dicek & "dipesan" saat booking (booking_groups.voucher_id; ikut pindah saat jadwal ulang);
--   • potongan dihitung saat bayar di kasir; tidak ditumpuk dengan diskon paket / promo online — dipakai yang terbesar;
--   • transaksi mencatat voucher yang benar-benar dipakai (transactions.voucher_id).
-- Kuota terpakai = booking ber-voucher yang tidak dibatalkan/no-show (termasuk yang sudah dibayar).
create table vouchers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9-]{3,20}$'),
  kind text not null check (kind in ('pct', 'amount')),
  value bigint not null check (value > 0),
  category service_category check (category is distinct from 'retail'), -- kosong = semua layanan
  min_spend bigint not null default 0 check (min_spend >= 0),
  quota int check (quota > 0),
  once_per_customer boolean not null default true,
  starts_on date,
  ends_on date,
  active boolean not null default true,
  note text not null default '',
  created_at timestamptz not null default now(),
  check (kind <> 'pct' or value <= 100),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create function vouchers_normalize() returns trigger language plpgsql as $$
begin new.code := upper(trim(new.code)); return new; end $$;
create trigger vouchers_normalize before insert or update of code on vouchers for each row execute function vouchers_normalize();
alter table vouchers enable row level security;
create policy manager_all on vouchers for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
create policy cashier_read on vouchers for select to authenticated using (auth_role() = 'cashier');
create trigger audit_vouchers after insert or update or delete on vouchers for each row execute function audit_row();

alter table booking_groups add column voucher_id uuid references vouchers (id);
alter table transactions add column voucher_id uuid references vouchers (id);

-- Cek voucher untuk sekumpulan layanan (dan pelanggan bila diketahui). Dipakai book_online & pratinjau.
create function voucher_check(p_code text, p_service_ids uuid[], p_customer uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v vouchers; today date := jkt_today(); used int; base bigint; disc bigint;
begin
  select * into v from vouchers where code = upper(trim(coalesce(p_code, ''))) and active;
  if not found then return jsonb_build_object('ok', false, 'message', 'Kode voucher tidak dikenal'); end if;
  if (v.starts_on is not null and today < v.starts_on) or (v.ends_on is not null and today > v.ends_on) then
    return jsonb_build_object('ok', false, 'message', 'Voucher sedang tidak berlaku');
  end if;
  if v.quota is not null then
    select count(*) into used from booking_groups g where g.voucher_id = v.id
      and exists (select 1 from appointments a where a.booking_group_id = g.id and a.status not in ('cancelled', 'no_show'));
    if used >= v.quota then return jsonb_build_object('ok', false, 'message', 'Kuota voucher sudah habis'); end if;
  end if;
  if v.once_per_customer and p_customer is not null and exists (
       select 1 from booking_groups g where g.voucher_id = v.id and g.customer_id = p_customer
         and exists (select 1 from appointments a where a.booking_group_id = g.id and a.status not in ('cancelled', 'no_show'))) then
    return jsonb_build_object('ok', false, 'message', 'Voucher ini sudah pernah dipakai dengan nomor ini');
  end if;
  select coalesce(sum(price), 0) into base from services
  where id = any (p_service_ids) and category <> 'retail' and (v.category is null or category = v.category);
  if base = 0 then return jsonb_build_object('ok', false, 'message', 'Voucher tidak berlaku untuk layanan yang dipilih'); end if;
  if base < v.min_spend then
    return jsonb_build_object('ok', false, 'message', 'Voucher berlaku untuk minimal belanja Rp' || to_char(v.min_spend, 'FM999G999G999'));
  end if;
  disc := case when v.kind = 'pct' then round(base * v.value / 10000.0) * 100 else least(v.value, base) end;
  return jsonb_build_object('ok', true, 'voucher_id', v.id, 'code', v.code, 'discount', disc, 'base', base,
    'label', case when v.kind = 'pct' then v.value || '%' else 'Rp' || to_char(v.value, 'FM999G999G999') end);
end $$;
revoke execute on function voucher_check(text, uuid[], uuid) from public, anon, authenticated;

-- Pratinjau di halaman booking (server action, dibatasi 20 percobaan / 10 menit per IP).
create function voucher_preview(p_code text, p_service_ids uuid[], p_ip text default '')
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_ip, '') <> '' then
    if (select count(*) from booking_attempts where key = 'vch:' || p_ip and created_at > now() - interval '10 minutes') >= 20 then
      return jsonb_build_object('ok', false, 'message', 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
    end if;
    insert into booking_attempts (key) values ('vch:' || p_ip);
  end if;
  return voucher_check(p_code, p_service_ids, null);
end $$;
revoke execute on function voucher_preview(text, uuid[], text) from public, anon, authenticated;

-- Pemakaian per voucher (layar manajer)
create function voucher_usage() returns table (voucher_id uuid, reserved int, redeemed int, discount_total bigint)
language sql stable security definer set search_path = public as $$
  select v.id,
         (select count(*) from booking_groups g where g.voucher_id = v.id
            and exists (select 1 from appointments a where a.booking_group_id = g.id and a.status not in ('cancelled', 'no_show')))::int,
         (select count(*) from transactions t where t.voucher_id = v.id and t.voided_at is null)::int,
         (select coalesce(sum(t.discount_amount), 0) from transactions t where t.voucher_id = v.id and t.voided_at is null)::bigint
  from vouchers v where auth_role() = 'manager'
$$;
revoke execute on function voucher_usage() from public, anon;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['book_online', $a$rl_key text;$a$, $a$rl_key text; vc jsonb; vid uuid;$a$],
    -- booking: cek voucher sebelum menulis apa pun; jadwal ulang tanpa kode → bawa voucher booking lama
    array['book_online', $a$  begin  -- subtransaksi$a$,
          $a$  if nullif(trim(coalesce(p ->> 'voucher_code', '')), '') is not null then
    vc := voucher_check(p ->> 'voucher_code', ids, coalesce(cid, (select id from customers where whatsapp = wa)));
    if not (vc ->> 'ok')::boolean then return jsonb_build_object('ok', false, 'code', 'voucher', 'message', vc ->> 'message'); end if;
    vid := (vc ->> 'voucher_id')::uuid;
  elsif resched is not null then
    vid := (select voucher_id from booking_groups where id = resched);
  end if;

  begin  -- subtransaksi$a$],
    array['book_online', $a$    insert into booking_groups (code, customer_id, source, client_request_id, rescheduled_from, created_by)
    values (gen_booking_code(), cid, 'online', req, resched, actor) returning * into grp;$a$,
          $a$    insert into booking_groups (code, customer_id, source, client_request_id, rescheduled_from, created_by, voucher_id)
    values (gen_booking_code(), cid, 'online', req, resched, actor, vid) returning * into grp;$a$],
    -- kasir: tandai baris yang memenuhi syarat voucher booking-nya
    array['checkout', $a$cpart bigint := coalesce(nullif(p ->> 'cash_part', '')::bigint, 0);$a$,
          $a$cpart bigint := coalesce(nullif(p ->> 'cash_part', '')::bigint, 0); vid uuid; vrow vouchers; vbase bigint; last_v int; vdisc bigint; use_voucher boolean := false;$a$],
    array['checkout', $a$           'from_upsell', coalesce((e.v ->> 'from_upsell')::boolean, false),$a$,
          $a$           'from_upsell', coalesce((e.v ->> 'from_upsell')::boolean, false),
           'voucher_id', vo.id,
           'vch', coalesce(s.category <> 'retail' and vo.id is not null and (vo.category is null or s.category = vo.category), false),$a$],
    array['checkout', $a$  left join appointments a on a.id = nullif(e.v ->> 'appointment_id', '')::uuid;$a$,
          $a$  left join appointments a on a.id = nullif(e.v ->> 'appointment_id', '')::uuid
  left join booking_groups bg on bg.id = a.booking_group_id
  left join vouchers vo on vo.id = bg.voucher_id and vo.active;$a$],
    array['checkout', $a$  total := sub - disc;
  if coalesce((p ->> 'use_deposit')$a$,
          $a$  -- voucher booking online: dibanding diskon paket/promo, pakai yang terbesar (tidak ditumpuk)
  select (x ->> 'voucher_id')::uuid into vid from jsonb_array_elements(lines) x where (x ->> 'vch')::boolean limit 1;
  if vid is not null then
    select * into vrow from vouchers where id = vid;
    select coalesce(sum((x ->> 'price')::bigint), 0), max(o) into vbase, last_v
    from jsonb_array_elements(lines) with ordinality y(x, o) where (x ->> 'vch')::boolean and x ->> 'voucher_id' = vid::text;
    if vbase >= vrow.min_spend then
      vdisc := case when vrow.kind = 'pct' then round(vbase * vrow.value / 10000.0) * 100 else least(vrow.value, vbase) end;
      if vdisc > disc then
        disc := vdisc; use_promo := true; use_voucher := true; promo_base := vbase; last_promo := last_v;
        -- alokasi diskon memakai jalur promo: hanya baris voucher
        select jsonb_agg(x || jsonb_build_object('promo', (x ->> 'vch')::boolean and x ->> 'voucher_id' = vid::text) order by o)
        into lines from jsonb_array_elements(lines) with ordinality y(x, o);
      end if;
    end if;
  end if;
  total := sub - disc;
  if coalesce((p ->> 'use_deposit')$a$],
    array['checkout', $a$case when use_promo then 'Promo booking online '$a$, $a$case when use_voucher then 'Voucher ' || vrow.code when use_promo then 'Promo booking online '$a$],
    array['checkout', $a$tip_amount, tip_staff_id, cash_part)$a$, $a$tip_amount, tip_staff_id, cash_part, voucher_id)$a$],
    array['checkout', $a$tip, tip_staff, cpart)$a$, $a$tip, tip_staff, cpart, case when use_voucher then vid end)$a$]
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
