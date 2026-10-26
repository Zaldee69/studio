-- Voucher: (1) bisa dibatasi hari tertentu, (2) bisa dipakai kasir untuk pelanggan walk-in.
--   • vouchers.weekdays = digit hari ISO yang berlaku, urut naik ('1234' = Senin–Kamis, '67' = Sabtu–Minggu); kosong = semua hari.
--     Booking online: dicek terhadap TANGGAL JADWAL; kasir: terhadap hari ini. Periode berlaku tetap dicek terhadap hari ini.
--   • kasir: checkout(p.voucher_code) untuk baris yang tidak membawa voucher booking; voucher "1× per pelanggan" wajib
--     memilih pelanggan (nomor WA) → sekaligus mengisi data pelanggan.
--   • kuota & 1× per pelanggan menghitung booking ber-voucher yang aktif + transaksi kasir ber-voucher di luar booking itu.
alter table vouchers add column weekdays text check (weekdays ~ '^1?2?3?4?5?6?7?$' and weekdays <> '');

create function voucher_days_label(w text) returns text language sql immutable as $$
  select case when w is null then 'semua hari'
              when length(w) > 2 and strpos('1234567', w) > 0 then n[left(w, 1)::int] || '–' || n[right(w, 1)::int]
              else (select string_agg(n[d::int], ', ' order by d) from regexp_split_to_table(w, '') d) end
  from (select array['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as n) x
$$;

-- Pemakaian voucher: booking aktif + transaksi kasir yang tidak berasal dari booking ber-voucher yang sama.
create function voucher_uses(p_voucher uuid, p_customer uuid default null) returns int
language sql stable security definer set search_path = public as $$
  select ((select count(*) from booking_groups g where g.voucher_id = p_voucher and (p_customer is null or g.customer_id = p_customer)
             and exists (select 1 from appointments a where a.booking_group_id = g.id and a.status not in ('cancelled', 'no_show')))
        + (select count(*) from transactions t where t.voucher_id = p_voucher and t.voided_at is null and (p_customer is null or t.customer_id = p_customer)
             and not exists (select 1 from transaction_items ti join appointments a on a.id = ti.appointment_id
                             join booking_groups g on g.id = a.booking_group_id
                             where ti.transaction_id = t.id and g.voucher_id = p_voucher)))::int
$$;
revoke execute on function voucher_uses(uuid, uuid) from public, anon, authenticated;

drop function voucher_preview(text, uuid[], text);
drop function voucher_check(text, uuid[], uuid);
create function voucher_check(p_code text, p_service_ids uuid[], p_customer uuid default null, p_date date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v vouchers; today date := jkt_today(); day date := coalesce(p_date, jkt_today()); base bigint; disc bigint;
begin
  select * into v from vouchers where code = upper(trim(coalesce(p_code, ''))) and active;
  if not found then return jsonb_build_object('ok', false, 'message', 'Kode voucher tidak dikenal'); end if;
  if (v.starts_on is not null and today < v.starts_on) or (v.ends_on is not null and today > v.ends_on) then
    return jsonb_build_object('ok', false, 'message', 'Voucher sedang tidak berlaku');
  end if;
  if v.weekdays is not null and strpos(v.weekdays, extract(isodow from day)::int::text) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Voucher ini hanya berlaku hari ' || voucher_days_label(v.weekdays)
      || case when day <> today then ' — pilih jadwal di hari tersebut' else '' end);
  end if;
  if v.quota is not null and voucher_uses(v.id) >= v.quota then
    return jsonb_build_object('ok', false, 'message', 'Kuota voucher sudah habis');
  end if;
  if v.once_per_customer and p_customer is not null and voucher_uses(v.id, p_customer) > 0 then
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
    'label', case when v.kind = 'pct' then v.value || '%' else 'Rp' || to_char(v.value, 'FM999G999G999') end,
    'days', case when v.weekdays is not null then voucher_days_label(v.weekdays) end);
end $$;
revoke execute on function voucher_check(text, uuid[], uuid, date) from public, anon, authenticated;

-- Pratinjau di halaman booking: + tanggal jadwal yang dipilih (dibatasi 20 percobaan / 10 menit per IP).
create function voucher_preview(p_code text, p_service_ids uuid[], p_ip text default '', p_date date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if coalesce(p_ip, '') <> '' then
    if (select count(*) from booking_attempts where key = 'vch:' || p_ip and created_at > now() - interval '10 minutes') >= 20 then
      return jsonb_build_object('ok', false, 'message', 'Terlalu banyak percobaan. Coba lagi dalam 10 menit.');
    end if;
    insert into booking_attempts (key) values ('vch:' || p_ip);
  end if;
  return voucher_check(p_code, p_service_ids, null, p_date);
end $$;
revoke execute on function voucher_preview(text, uuid[], text, date) from public, anon, authenticated;

-- Cek kode di kasir (hari ini) + data voucher untuk hitungan keranjang.
create function voucher_check_kasir(p_code text, p_service_ids uuid[], p_customer uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb; v vouchers;
begin
  perform require_role('manager', 'cashier');
  r := voucher_check(p_code, p_service_ids, p_customer, jkt_today());
  if not (r ->> 'ok')::boolean then return r; end if;
  select * into v from vouchers where id = (r ->> 'voucher_id')::uuid;
  if v.once_per_customer and p_customer is null then
    return jsonb_build_object('ok', false, 'message', 'Voucher ini 1× per pelanggan: pilih atau tambahkan pelanggan (nomor WA) dulu');
  end if;
  return r || jsonb_build_object('voucher', jsonb_build_object('id', v.id, 'code', v.code, 'kind', v.kind, 'value', v.value,
    'category', v.category, 'min_spend', v.min_spend, 'active', v.active));
end $$;
revoke execute on function voucher_check_kasir(text, uuid[], uuid) from public, anon;

-- Layar manajer: "reserved" = kuota terpakai (booking aktif + kasir).
create or replace function voucher_usage() returns table (voucher_id uuid, reserved int, redeemed int, discount_total bigint)
language sql stable security definer set search_path = public as $$
  select v.id, voucher_uses(v.id),
         (select count(*) from transactions t where t.voucher_id = v.id and t.voided_at is null)::int,
         (select coalesce(sum(t.discount_amount), 0) from transactions t where t.voucher_id = v.id and t.voided_at is null)::bigint
  from vouchers v where auth_role() = 'manager'
$$;

-- Notifikasi voucher (20261025000002): + hari berlaku.
create or replace function alert_voucher() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.kind, new.value, new.quota, new.min_spend, new.active, new.starts_on, new.ends_on, new.weekdays)
                        is not distinct from (old.kind, old.value, old.quota, old.min_spend, old.active, old.starts_on, old.ends_on, old.weekdays) then
    return null;
  end if;
  perform safe_alert(format(E'🎟️ Voucher %s %s oleh %s: %s · kuota %s · min. belanja %s · berlaku %s s/d %s · hari %s%s',
    new.code, case when tg_op = 'INSERT' then 'dibuat' else 'diubah' end, actor_name(),
    case when new.kind = 'pct' then new.value || '%' else fmt_rp(new.value) end,
    coalesce(new.quota::text, 'tanpa batas'), case when new.min_spend > 0 then fmt_rp(new.min_spend) else '-' end,
    coalesce(fmt_tgl(new.starts_on), '-'), coalesce(fmt_tgl(new.ends_on), '-'), voucher_days_label(new.weekdays),
    case when not new.active then ' · NONAKTIF' else '' end));
  return null;
end $$;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    -- booking online: hari voucher dicek terhadap tanggal jadwal
    array['book_online', $a$vc := voucher_check(p ->> 'voucher_code', ids, coalesce(cid, (select id from customers where whatsapp = wa)));$a$,
          $a$vc := voucher_check(p ->> 'voucher_code', ids, coalesce(cid, (select id from customers where whatsapp = wa)), d);$a$],
    -- kasir: voucher yang dimasukkan kasir (walk-in / baris tanpa voucher booking)
    array['checkout', $a$vdisc bigint; use_voucher boolean := false;$a$, $a$vdisc bigint; use_voucher boolean := false; wvid uuid; wvc jsonb;$a$],
    array['checkout', $a$  -- Ritel: staff_id = staf penjual (opsional). Layanan: kapster (wajib).$a$,
          $a$  -- voucher dari kasir: dicek untuk hari ini; 1× per pelanggan → pelanggan wajib dipilih
  if nullif(trim(coalesce(p ->> 'voucher_code', '')), '') is not null then
    wvc := voucher_check(p ->> 'voucher_code', (select array_agg((e ->> 'service_id')::uuid) from jsonb_array_elements(p -> 'items') e), cid, jkt_today());
    if not (wvc ->> 'ok')::boolean then raise exception '%', wvc ->> 'message'; end if;
    wvid := (wvc ->> 'voucher_id')::uuid;
    if cid is null and (select once_per_customer from vouchers where id = wvid) then
      raise exception 'Voucher ini 1× per pelanggan: pilih atau tambahkan pelanggan (nomor WA) dulu';
    end if;
  end if;

  -- Ritel: staff_id = staf penjual (opsional). Layanan: kapster (wajib).$a$],
    array['checkout', $a$           'voucher_id', vo.id,
           'vch', coalesce(s.category <> 'retail' and vo.id is not null and (vo.category is null or s.category = vo.category), false),$a$,
          $a$           'voucher_id', coalesce(vo.id, vw.id),
           'vch', coalesce(s.category <> 'retail' and case when vo.id is not null then vo.category is null or s.category = vo.category
                                                          else vw.id is not null and (vw.category is null or s.category = vw.category) end, false),$a$],
    array['checkout', $a$  left join vouchers vo on vo.id = bg.voucher_id and vo.active;$a$,
          $a$  left join vouchers vo on vo.id = bg.voucher_id and vo.active
  left join vouchers vw on vw.id = wvid;$a$]
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
