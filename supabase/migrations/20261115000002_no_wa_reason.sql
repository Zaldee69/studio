alter table transactions add column if not exists no_wa_reason text;

CREATE OR REPLACE FUNCTION public.checkout(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  st settings; lines jsonb; n int; cnt int; appt_ids uuid[]; cid uuid := nullif(p ->> 'customer_id', '')::uuid;
  sub bigint; base bigint; has_b boolean; has_n boolean; disc bigint := 0; total bigint; dep bigint := 0;
  method text := p ->> 'method'; meth pay_method; txid uuid; tiid uuid; l jsonb; share bigint;
  allocated bigint := 0; last_svc int; promo_base bigint; promo_disc bigint := 0; last_promo int; use_promo boolean := false; i int := 0; tip bigint := coalesce(nullif(p ->> 'tip', '')::bigint, 0); tip_staff uuid := nullif(p ->> 'tip_staff_id', '')::uuid; received bigint := nullif(p ->> 'cash_received', '')::bigint; cpart bigint := coalesce(nullif(p ->> 'cash_part', '')::bigint, 0); vid uuid; vrow vouchers; vbase bigint; last_v int; vdisc bigint; use_voucher boolean := false; wvid uuid; wvc jsonb;
begin
  perform require_role('manager', 'cashier');
  -- permintaan yang sama (kirim ulang setelah koneksi putus) → kembalikan transaksi yang sudah tersimpan
  if nullif(p ->> 'client_request_id', '') is not null then
    perform pg_advisory_xact_lock(hashtext('checkout:' || (p ->> 'client_request_id')));
    select id into txid from transactions where client_request_id = p ->> 'client_request_id';
    if found then return txid; end if;
  end if;
  select * into st from settings;
  if method not in ('cash', 'qris', 'transfer') then raise exception 'Metode bayar tidak valid'; end if;
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

  -- voucher dari kasir: dicek untuk hari ini; 1× per pelanggan → pelanggan wajib dipilih
  if nullif(trim(coalesce(p ->> 'voucher_code', '')), '') is not null then
    raise exception 'Voucher hanya berlaku lewat booking online di dprasstudio.com';
    wvc := voucher_check(p ->> 'voucher_code', (select array_agg((e ->> 'service_id')::uuid) from jsonb_array_elements(p -> 'items') e), cid, jkt_today());
    if not (wvc ->> 'ok')::boolean then raise exception '%', wvc ->> 'message'; end if;
    wvid := (wvc ->> 'voucher_id')::uuid;
    if cid is null and (select once_per_customer from vouchers where id = wvid) then
      raise exception 'Voucher ini 1× per pelanggan: pilih atau tambahkan pelanggan (nomor WA) dulu';
    end if;
  end if;

  -- Ritel: staff_id = staf penjual (opsional). Layanan: kapster (wajib).
  select jsonb_agg(jsonb_build_object(
           'service_id', s.id, 'name', s.name, 'category', s.category, 'price', s.price,
           'staff_id', case when s.category = 'retail' then nullif(e.v ->> 'staff_id', '')::uuid
                            else coalesce(nullif(e.v ->> 'staff_id', '')::uuid, a.staff_id) end,
           'appointment_id', a.id, 'stock_item_id', s.stock_item_id,
           'from_upsell', coalesce((e.v ->> 'from_upsell')::boolean, false),
           'voucher_id', coalesce(vo.id, vw.id),
           'vch', coalesce(s.category <> 'retail' and case when vo.id is not null then vo.category is null or s.category = vo.category
                                                          else vw.id is not null and (vw.category is null or s.category = vw.category) end, false),
           'promo', coalesce(s.category <> 'retail' and a.source = 'online' and st.online_promo_pct > 0
                             and (a.created_at at time zone 'Asia/Jakarta')::date between st.online_promo_start and st.online_promo_end, false)) order by e.ord),
         count(*)
  into lines, cnt
  from jsonb_array_elements(p -> 'items') with ordinality e(v, ord)
  join services s on s.id = (e.v ->> 'service_id')::uuid
  left join appointments a on a.id = nullif(e.v ->> 'appointment_id', '')::uuid
  left join booking_groups bg on bg.id = a.booking_group_id
  left join vouchers vo on vo.id = bg.voucher_id and vo.active
  left join vouchers vw on vw.id = wvid;
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
         max(o) filter (where x ->> 'category' <> 'retail'),
         coalesce(sum((x ->> 'price')::bigint) filter (where (x ->> 'promo')::boolean), 0),
         max(o) filter (where (x ->> 'promo')::boolean)
  into sub, base, has_b, has_n, last_svc, promo_base, last_promo
  from jsonb_array_elements(lines) with ordinality y(x, o);

  if has_b and has_n then disc := round(base * st.bundle_pct / 10000.0) * 100; end if;
  promo_disc := round(promo_base * st.online_promo_pct / 10000.0) * 100;
  if promo_disc > disc then disc := promo_disc; use_promo := true; end if;  -- tidak ditumpuk: pakai yang lebih besar
  -- voucher booking online: dibanding diskon paket/promo, pakai yang terbesar (tidak ditumpuk)
  select (x ->> 'voucher_id')::uuid into vid from jsonb_array_elements(lines) x where (x ->> 'vch')::boolean limit 1;
  if vid is not null then
    select * into vrow from vouchers where id = vid;
    select coalesce(sum((x ->> 'price')::bigint), 0), max(o) into vbase, last_v
    from jsonb_array_elements(lines) with ordinality y(x, o) where (x ->> 'vch')::boolean and x ->> 'voucher_id' = vid::text;
    if vbase >= vrow.min_spend then
      vdisc := least(case when vrow.kind = 'pct' then round(vbase * vrow.value / 10000.0) * 100 else least(vrow.value, vbase) end, coalesce(vrow.max_discount, vbase));
      if vdisc > disc then
        disc := vdisc; use_promo := true; use_voucher := true; promo_base := vbase; last_promo := last_v;
        -- alokasi diskon memakai jalur promo: hanya baris voucher
        select jsonb_agg(x || jsonb_build_object('promo', (x ->> 'vch')::boolean and x ->> 'voucher_id' = vid::text) order by o)
        into lines from jsonb_array_elements(lines) with ordinality y(x, o);
      end if;
    end if;
  end if;
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

  if cpart < 0 or (cpart > 0 and (method = 'cash' or cpart >= total - dep)) then
    raise exception 'Bagian tunai harus kurang dari tagihan QRIS/transfer';
  end if;
  if tip < 0 or tip > 10000000 then raise exception 'Tips tidak valid'; end if;
  if tip > 0 and (meth not in ('qris', 'deposit_qris', 'transfer', 'deposit_transfer') or total - dep <= 0) then raise exception 'Tips hanya untuk pembayaran QRIS/transfer'; end if;
  if tip > 0 and not exists (select 1 from staff where id = tip_staff and active) then raise exception 'Pilih staf penerima tips'; end if;
  if tip = 0 then tip_staff := null; end if;
  insert into transactions (customer_id, subtotal, discount_amount, discount_label, total, deposit_used,
                            paid_amount, payment_method, cashier_id, cash_received, qris_ref, tip_amount, tip_staff_id, cash_part, voucher_id, client_request_id, no_wa_reason)
  values (cid, sub, disc, case when use_voucher then 'Voucher ' || vrow.code when use_promo then 'Promo booking online ' || st.online_promo_pct || '%'
               when disc > 0 then 'Diskon paket ' || st.bundle_pct || '%' else '' end,
          total, dep, total - dep, meth, auth.uid(), received, p ->> 'qris_ref', tip, tip_staff, cpart, case when use_voucher then vid end, nullif(p ->> 'client_request_id', ''), nullif(p ->> 'no_wa_reason', ''))
  returning id into txid;

  for l in select * from jsonb_array_elements(lines) loop
    i := i + 1;
    share := 0;
    if disc > 0 and l ->> 'category' <> 'retail' and (not use_promo or (l ->> 'promo')::boolean) then
      share := case when i = (case when use_promo then last_promo else last_svc end) then disc - allocated
                    else floor(disc::numeric * (l ->> 'price')::bigint / (case when use_promo then promo_base else base end))::bigint end;
      allocated := allocated + share;
    end if;

    insert into transaction_items (transaction_id, service_id, appointment_id, staff_id, name, category,
                                   price, discount_share, net_amount, from_upsell, commission_base, commission_pct, commission_deduct_hpp)
    values (txid, (l ->> 'service_id')::uuid, (l ->> 'appointment_id')::uuid, (l ->> 'staff_id')::uuid,
            l ->> 'name', (l ->> 'category')::service_category, (l ->> 'price')::bigint, share,
            (l ->> 'price')::bigint - share, (l ->> 'from_upsell')::boolean,
            case when st.commission_basis = 'gross' then (l ->> 'price')::bigint end,
            -- aturan komisi dibekukan saat bayar (perubahan aturan tidak berlaku mundur)
            (select case when (l ->> 'category') = 'retail' then coalesce(s.retail_pct_override, st.retail_commission_pct)
                         else coalesce(s.commission_pct_override, st.commission_pct) end from staff s where s.id = (l ->> 'staff_id')::uuid),
            (select case when (l ->> 'category') = 'retail' then false else coalesce(s.deduct_hpp, st.commission_deduct_hpp) end
             from staff s where s.id = (l ->> 'staff_id')::uuid))
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
end $function$;
