-- Bayar campuran: sebagian tunai + sisanya QRIS/transfer dalam satu transaksi.
-- transactions.cash_part = bagian tunai dari paid_amount untuk metode QRIS/transfer (0 = tidak campuran).
-- Bagian tunai masuk laci (tutup kasir, saldo laci, refund void); bagian non-tunai = paid_amount − cash_part (cocok dengan mutasi bank).
alter table transactions add column cash_part bigint not null default 0,
  add constraint transactions_cash_part check (cash_part >= 0 and cash_part < greatest(paid_amount, 1)
    and (cash_part = 0 or payment_method in ('qris', 'deposit_qris', 'transfer', 'deposit_transfer')));

do $$
declare
  fn text; def text; old text; i int;
  cash constant text := $c$case when payment_method in ('cash', 'deposit_cash') then paid_amount else cash_part end$c$;
  patches text[][] := array[
    array['checkout', $a$received bigint := nullif(p ->> 'cash_received', '')::bigint;$a$,
          $a$received bigint := nullif(p ->> 'cash_received', '')::bigint; cpart bigint := coalesce(nullif(p ->> 'cash_part', '')::bigint, 0);$a$],
    array['checkout', $a$  if tip < 0 or tip > 10000000 then raise exception 'Tips tidak valid'; end if;$a$,
          $a$  if cpart < 0 or (cpart > 0 and (method = 'cash' or cpart >= total - dep)) then
    raise exception 'Bagian tunai harus kurang dari tagihan QRIS/transfer';
  end if;
  if tip < 0 or tip > 10000000 then raise exception 'Tips tidak valid'; end if;$a$],
    array['checkout', $a$paid_amount, payment_method, cashier_id, cash_received, qris_ref, tip_amount, tip_staff_id)$a$,
          $a$paid_amount, payment_method, cashier_id, cash_received, qris_ref, tip_amount, tip_staff_id, cash_part)$a$],
    array['checkout', $a$p ->> 'qris_ref', tip, tip_staff)$a$, $a$p ->> 'qris_ref', tip, tip_staff, cpart)$a$],
    -- saldo laci harian
    array['cash_day_net', $a$select sum(paid_amount) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null
                     and payment_method in ('cash', 'deposit_cash')), 0)$a$,
          $a$select sum(CASH) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null), 0)$a$],
    array['cash_day_net', $a$select sum(paid_amount) from transactions where refund_date = p_date$a$, $a$select sum(CASH) from transactions where refund_date = p_date$a$],
    -- tutup kasir
    array['cash_summary_full', $a$'cash_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('cash', 'deposit_cash')),$a$,
          $a$'cash_sales', (select coalesce(sum(CASH), 0) from ok),
    'mixed_count', (select count(*) from ok where cash_part > 0),$a$],
    array['cash_summary_full', $a$'qris_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('qris', 'deposit_qris')),$a$,
          $a$'qris_sales', (select coalesce(sum(paid_amount - cash_part), 0) from ok where payment_method in ('qris', 'deposit_qris')),$a$],
    array['cash_summary_full', $a$'transfer_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('transfer', 'deposit_transfer')),$a$,
          $a$'transfer_sales', (select coalesce(sum(paid_amount - cash_part), 0) from ok where payment_method in ('transfer', 'deposit_transfer')),$a$],
    array['cash_summary_full', $a$'refund_cash', (select coalesce(sum(paid_amount), 0) from transactions where refund_date = p_date),$a$,
          $a$'refund_cash', (select coalesce(sum(CASH), 0) from transactions where refund_date = p_date),$a$],
    -- laporan owner
    array['owner_finance', $a$'cash', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('cash', 'deposit_cash')),$a$,
          $a$'cash', (select coalesce(sum(CASH), 0) from tx where voided_at is null),$a$],
    array['owner_finance', $a$'qris', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('qris', 'deposit_qris')),$a$,
          $a$'qris', (select coalesce(sum(paid_amount - cash_part), 0) from tx where voided_at is null and payment_method in ('qris', 'deposit_qris')),$a$],
    array['owner_finance', $a$'transfer', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('transfer', 'deposit_transfer')),$a$,
          $a$'transfer', (select coalesce(sum(paid_amount - cash_part), 0) from tx where voided_at is null and payment_method in ('transfer', 'deposit_transfer')),$a$],
    array['owner_daily', $a$coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('cash', 'deposit_cash')), 0) as cash,$a$,
          $a$coalesce(sum(CASH) filter (where voided_at is null), 0) as cash,$a$],
    array['owner_daily', $a$coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('qris', 'deposit_qris')), 0) as qris,$a$,
          $a$coalesce(sum(paid_amount - cash_part) filter (where voided_at is null and payment_method in ('qris', 'deposit_qris')), 0) as qris,$a$],
    array['owner_daily', $a$coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('transfer', 'deposit_transfer')), 0) as transfer,$a$,
          $a$coalesce(sum(paid_amount - cash_part) filter (where voided_at is null and payment_method in ('transfer', 'deposit_transfer')), 0) as transfer,$a$],
    -- anti-fraud: nominal yang harus cocok dengan mutasi = bagian non-tunai
    array['fraud_overview', $a$'amount', t.paid_amount,$a$, $a$'amount', t.paid_amount - t.cash_part,$a$],
    -- void: refund laci bila ada bagian tunai
    array['void_transaction', $a$refund_date = case when payment_method in ('cash', 'deposit_cash') and paid_amount > 0$a$,
          $a$refund_date = case when (CASH) > 0$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    old := def;
    def := replace(def, patches[i][2], replace(patches[i][3], 'CASH', cash));
    if def = old then raise exception 'Patch % #% tidak menemukan teks', fn, i; end if;
    execute def;
  end loop;
end $$;
