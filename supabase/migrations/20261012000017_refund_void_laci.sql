-- Celah kas pada void (audit keuangan):
--   1. Void transaksi yang bagian tunainya sudah masuk tutup kasir: uang dikembalikan dari laci SAAT void → dicatat sebagai
--      refund tunai di hari void (atau besok bila kasir hari ini sudah ditutup) → kas diharapkan & saldo laci ikut turun.
--      Void sebelum tanggalnya ditutup tidak butuh ini (penjualan tunainya memang tidak dihitung).
--   2. Tips sudah diserahkan tunai saat bayar → tetap mengurangi laci walau transaksinya kemudian di-void.
alter table transactions add column refund_date date;

-- immutability: saat void, refund_date boleh diisi bersama voided_at/void_reason
create or replace function guard_tx_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then raise exception 'Transaksi tidak bisa dihapus; gunakan void'; end if;
  if old.voided_at is not null and new.customer_id is not distinct from old.customer_id then raise exception 'Transaksi sudah di-void'; end if;
  if (to_jsonb(new) - 'voided_at' - 'void_reason' - 'customer_id' - 'refund_date') <> (to_jsonb(old) - 'voided_at' - 'void_reason' - 'customer_id' - 'refund_date') then
    raise exception 'Transaksi immutable';
  end if;
  if new.refund_date is distinct from old.refund_date and (old.voided_at is not null or new.voided_at is null) then
    raise exception 'Transaksi immutable';
  end if;
  if new.customer_id is distinct from old.customer_id
     and (new.customer_id is not null or current_setting('app.forget_customer', true) is distinct from 'on') then
    raise exception 'Transaksi immutable';
  end if;
  return new;
end $$;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    -- void: tentukan tanggal refund tunai bila tanggal transaksinya sudah ditutup kasir
    array['void_transaction', $a$  update transactions set voided_at = now(), void_reason = trim(p_reason) where id = p_id and voided_at is null;$a$,
          $a$  update transactions set voided_at = now(), void_reason = trim(p_reason),
    refund_date = case when payment_method in ('cash', 'deposit_cash') and paid_amount > 0
                        and exists (select 1 from cash_closings c where c.date = (created_at at time zone 'Asia/Jakarta')::date)
                       then case when exists (select 1 from cash_closings c where c.date = jkt_today()) then jkt_today() + 1 else jkt_today() end end
  where id = p_id and voided_at is null;$a$],
    -- tutup kasir: tips dari semua transaksi (termasuk yang di-void) + refund tunai hari itu
    array['cash_summary_full', $a$    'tip_qris', (select coalesce(sum(tip_amount), 0) from ok),
    'tip_count', (select count(*) from ok where tip_amount > 0),$a$,
          $a$    'tip_qris', (select coalesce(sum(tip_amount), 0) from tx),
    'tip_count', (select count(*) from tx where tip_amount > 0),
    'refund_cash', (select coalesce(sum(paid_amount), 0) from transactions where refund_date = p_date),
    'refund_count', (select count(*) from transactions where refund_date = p_date),$a$],
    array['cash_summary_full', $a$- (r ->> 'stock_cash')::bigint)$a$, $a$- (r ->> 'stock_cash')::bigint - (r ->> 'refund_cash')::bigint)$a$],
    array['cash_day_net', $a$        - coalesce((select sum(tip_amount) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null), 0)$a$,
          $a$        - coalesce((select sum(tip_amount) from transactions, b where created_at >= t0 and created_at < t1), 0)
        - coalesce((select sum(paid_amount) from transactions where refund_date = p_date), 0)$a$]
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
