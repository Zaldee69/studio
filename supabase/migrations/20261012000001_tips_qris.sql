-- Tips QRIS: pelanggan scan sekali (tagihan + tips). Tips = titipan untuk satu staf pilihan kasir, BUKAN pendapatan toko:
-- tidak masuk omzet/diskon/komisi. Diserahkan tunai dari laci saat itu → mengurangi kas diharapkan di tutup kasir,
-- sehingga "QRIS diterima" (penjualan + tips) cocok dengan mutasi bank. Biaya MDR atas tips ditanggung toko.
-- Tips tunai tidak dicatat (langsung ke staf). Transaksi di-void → tipsnya ikut tidak dihitung (kembalikan uangnya ke laci).

alter table transactions add column tip_amount bigint not null default 0 check (tip_amount between 0 and 10000000),
  add column tip_staff_id uuid references staff (id),
  add constraint transactions_tip_staff check ((tip_amount = 0) = (tip_staff_id is null));

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['checkout', $a$i int := 0;$a$,
          $a$i int := 0; tip bigint := coalesce(nullif(p ->> 'tip', '')::bigint, 0); tip_staff uuid := nullif(p ->> 'tip_staff_id', '')::uuid;$a$],
    array['checkout', $a$  insert into transactions (customer_id, subtotal, discount_amount, discount_label, total, deposit_used,
                            paid_amount, payment_method, cashier_id, cash_received, qris_ref)$a$,
          $a$  if tip < 0 or tip > 10000000 then raise exception 'Tips tidak valid'; end if;
  if tip > 0 and (meth not in ('qris', 'deposit_qris') or total - dep <= 0) then raise exception 'Tips hanya untuk pembayaran QRIS'; end if;
  if tip > 0 and not exists (select 1 from staff where id = tip_staff and active) then raise exception 'Pilih staf penerima tips'; end if;
  if tip = 0 then tip_staff := null; end if;
  insert into transactions (customer_id, subtotal, discount_amount, discount_label, total, deposit_used,
                            paid_amount, payment_method, cashier_id, cash_received, qris_ref, tip_amount, tip_staff_id)$a$],
    array['checkout', $a$total - dep, meth, auth.uid(), received, p ->> 'qris_ref')$a$,
          $a$total - dep, meth, auth.uid(), received, p ->> 'qris_ref', tip, tip_staff)$a$],
    array['cash_summary_full', $a$    'expense_count', (select count(*) from ex),$a$,
          $a$    'expense_count', (select count(*) from ex),
    'tip_qris', (select coalesce(sum(tip_amount), 0) from ok),
    'tip_count', (select count(*) from ok where tip_amount > 0),$a$],
    array['cash_summary_full', $a$- (r ->> 'expense_cash')::bigint)$a$,
          $a$- (r ->> 'expense_cash')::bigint - (r ->> 'tip_qris')::bigint)$a$],
    array['owner_finance', $a$      'deposit', (select coalesce(sum(deposit_used), 0) from tx where voided_at is null)),$a$,
          $a$      'deposit', (select coalesce(sum(deposit_used), 0) from tx where voided_at is null),
      'tips_qris', (select coalesce(sum(tip_amount), 0) from tx where voided_at is null)),$a$]
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
