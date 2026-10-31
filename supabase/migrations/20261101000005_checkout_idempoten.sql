-- Audit UANG-7 (1 Nov): koneksi putus setelah checkout tersimpan → kasir menekan Bayar lagi → transaksi dobel (tunai tanpa
-- No. referensi). POS mengirim client_request_id per isi keranjang; id yang sama = transaksi yang sama dikembalikan.
alter table transactions add column client_request_id text unique check (client_request_id is null or length(client_request_id) between 8 and 64);

do $$
declare
  fn text := 'checkout(jsonb)'; def text; old text; i int;
  patches text[][] := array[
    array[$a$  perform require_role('manager', 'cashier');
  select * into st from settings;$a$,
          $a$  perform require_role('manager', 'cashier');
  -- permintaan yang sama (kirim ulang setelah koneksi putus) → kembalikan transaksi yang sudah tersimpan
  if nullif(p ->> 'client_request_id', '') is not null then
    perform pg_advisory_xact_lock(hashtext('checkout:' || (p ->> 'client_request_id')));
    select id into txid from transactions where client_request_id = p ->> 'client_request_id';
    if found then return txid; end if;
  end if;
  select * into st from settings;$a$],
    array[$a$paid_amount, payment_method, cashier_id, cash_received, qris_ref, tip_amount, tip_staff_id, cash_part, voucher_id)$a$,
          $a$paid_amount, payment_method, cashier_id, cash_received, qris_ref, tip_amount, tip_staff_id, cash_part, voucher_id, client_request_id)$a$],
    array[$a$tip, tip_staff, cpart, case when use_voucher then vid end)$a$,
          $a$tip, tip_staff, cpart, case when use_voucher then vid end, nullif(p ->> 'client_request_id', ''))$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    select pg_get_functiondef(fn::regprocedure) into def;
    old := def;
    def := replace(def, patches[i][1], patches[i][2]);
    if def = old then raise exception 'Patch % (%) tidak menemukan teks', i, fn; end if;
    execute def;
  end loop;
end $$;
