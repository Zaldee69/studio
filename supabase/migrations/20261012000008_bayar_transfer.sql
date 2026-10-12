-- Bayar transfer bank: di kasir & top-up deposit. Wajib No. referensi / nama pengirim (unik 7 hari, sama seperti QRIS;
-- kolom qris_ref dipakai untuk keduanya). Tidak masuk kas diharapkan; tampil terpisah di tutup kasir & laporan.
-- Tips boleh pada pembayaran non-tunai (QRIS/transfer), diserahkan tunai dari laci.

alter table deposit_topups drop constraint deposit_topups_method_check;
alter table deposit_topups add constraint deposit_topups_method_check check (method in ('cash', 'qris', 'transfer'));

create or replace function check_qris_ref() returns trigger language plpgsql set search_path = public as $$
declare r jsonb := to_jsonb(new); needs boolean; label text;  -- dua tabel, nama kolom metode berbeda
begin
  label := case when coalesce(r ->> 'payment_method', r ->> 'method') like '%transfer' then 'transfer' else 'QRIS' end;
  needs := case tg_table_name
    when 'transactions' then r ->> 'payment_method' in ('qris', 'deposit_qris', 'transfer', 'deposit_transfer') and (r ->> 'paid_amount')::bigint > 0
    else r ->> 'method' in ('qris', 'transfer') end;
  if not needs then new.qris_ref := null; return new; end if;
  if auth.uid() is null then return new; end if;  -- data sistem (seed/impor) tanpa sesi tim
  new.qris_ref := upper(regexp_replace(coalesce(new.qris_ref, ''), '[\s-]', '', 'g'));
  if new.qris_ref !~ '^[A-Z0-9]{4,40}$' then
    raise exception 'Isi No. referensi % (min. 4 huruf/angka, dari bukti bayar pelanggan atau notifikasi bank)', label;
  end if;
  if exists (select 1 from transactions t where t.qris_ref = new.qris_ref and t.voided_at is null and t.created_at > now() - interval '7 days')
     or exists (select 1 from deposit_topups d where d.qris_ref = new.qris_ref and d.created_at > now() - interval '7 days') then
    raise exception 'No. referensi % sudah dipakai transaksi lain', new.qris_ref;
  end if;
  return new;
end $$;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['checkout', $a$if method not in ('cash', 'qris') then$a$, $a$if method not in ('cash', 'qris', 'transfer') then$a$],
    array['checkout', $a$if tip > 0 and (meth not in ('qris', 'deposit_qris') or total - dep <= 0) then raise exception 'Tips hanya untuk pembayaran QRIS'; end if;$a$,
          $a$if tip > 0 and (meth not in ('qris', 'deposit_qris', 'transfer', 'deposit_transfer') or total - dep <= 0) then raise exception 'Tips hanya untuk pembayaran QRIS/transfer'; end if;$a$],
    array['topup_deposit', $a$if p_method not in ('cash', 'qris') then$a$, $a$if p_method not in ('cash', 'qris', 'transfer') then$a$],
    array['cash_summary_full', $a$    'qris_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('qris', 'deposit_qris')),$a$,
          $a$    'qris_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('qris', 'deposit_qris')),
    'transfer_sales', (select coalesce(sum(paid_amount), 0) from ok where payment_method in ('transfer', 'deposit_transfer')),$a$],
    array['cash_summary_full', $a$    'topup_qris', (select coalesce(sum(amount_paid), 0) from tp where method = 'qris'),$a$,
          $a$    'topup_qris', (select coalesce(sum(amount_paid), 0) from tp where method = 'qris'),
    'topup_transfer', (select coalesce(sum(amount_paid), 0) from tp where method = 'transfer'),$a$],
    array['owner_finance', $a$      'qris', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('qris', 'deposit_qris')),$a$,
          $a$      'qris', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('qris', 'deposit_qris')),
      'transfer', (select coalesce(sum(paid_amount), 0) from tx where voided_at is null and payment_method in ('transfer', 'deposit_transfer')),$a$],
    array['owner_finance', $a$      'topup_qris', (select coalesce(sum(amount_paid), 0) from top where method = 'qris'),$a$,
          $a$      'topup_qris', (select coalesce(sum(amount_paid), 0) from top where method = 'qris'),
      'topup_transfer', (select coalesce(sum(amount_paid), 0) from top where method = 'transfer'),$a$],
    array['owner_daily', $a$          coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('qris', 'deposit_qris')), 0) as qris,$a$,
          $a$          coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('qris', 'deposit_qris')), 0) as qris,
          coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('transfer', 'deposit_transfer')), 0) as transfer,$a$],
    array['owner_daily', $a$'qris', coalesce(t.qris, 0),$a$, $a$'qris', coalesce(t.qris, 0), 'transfer', coalesce(t.transfer, 0),$a$]
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

-- Audit: rekonsiliasi pembayaran non-tunai mencakup transfer (cocokkan No. ref & nominal dengan mutasi rekening).
do $$
declare def text; old text;
begin
  select pg_get_functiondef('fraud_overview'::regproc) into def;
  old := def;
  def := replace(def, $a$where t.payment_method::text in ('qris', 'deposit_qris')$a$, $a$where t.payment_method::text in ('qris', 'deposit_qris', 'transfer', 'deposit_transfer')$a$);
  def := replace(def, $a$where d.method = 'qris'$a$, $a$where d.method in ('qris', 'transfer')$a$);
  def := replace(def, $a$'kind', 'Transaksi',$a$, $a$'kind', case when t.payment_method::text like '%transfer' then 'Transaksi · transfer' else 'Transaksi · QRIS' end,$a$);
  def := replace(def, $a$'kind', 'Top-up',$a$, $a$'kind', case when d.method::text = 'transfer' then 'Top-up · transfer' else 'Top-up · QRIS' end,$a$);
  if def = old then raise exception 'Patch fraud_overview tidak menemukan teks'; end if;
  execute def;
end $$;
