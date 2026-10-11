-- Pengeluaran operasional (sewa, listrik, perlengkapan, dll.). Kasir: hanya belanja kecil dari laci kas hari ini (≤ batas).
-- Foto nota wajib untuk pengeluaran di atas receipt_required_above (default Rp100.000), siapa pun yang mencatat. Manajer: semua sumber & tanggal, dan satu-satunya yang bisa membatalkan (void, dengan alasan).
-- Pengeluaran dari laci mengurangi "kas diharapkan" di tutup kasir; setelah tutup kasir tanggal itu final, pengeluaran laci
-- tanggal itu tidak bisa ditambah/dibatalkan lagi. Masuk laporan owner sampai laba bersih.
-- Bukan untuk: pembelian stok (Inventaris → Stok masuk), servis vendor (Perawatan fasilitas), gaji/komisi (SDM).

alter table settings add column petty_cash_limit bigint not null default 200000 check (petty_cash_limit >= 0),
  add column receipt_required_above bigint not null default 100000 check (receipt_required_above >= 0);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  date date not null default jkt_today(),
  category text not null check (category in ('sewa', 'listrik_air', 'internet_pulsa', 'perlengkapan', 'kebersihan', 'konsumsi',
                                             'pemasaran', 'transportasi', 'perbaikan', 'pajak_izin', 'lainnya')),
  description text not null check (length(trim(description)) between 2 and 200),
  amount bigint not null check (amount > 0 and amount <= 1000000000),
  source text not null check (source in ('laci', 'kas_toko', 'transfer')),
  receipt_path text,
  created_by uuid default auth.uid() references profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  voided_at timestamptz, voided_by uuid, void_reason text,
  check (voided_at is null or length(trim(coalesce(void_reason, ''))) > 0)
);
create index expenses_date_idx on expenses (date);
alter table expenses enable row level security;
create policy manager_read on expenses for select to authenticated using (auth_role() = 'manager');
create policy cashier_today on expenses for select to authenticated using (auth_role() = 'cashier' and date = jkt_today());
create trigger audit_expenses after insert or update on expenses for each row execute function audit_row();
alter publication supabase_realtime add table expenses;

-- Foto nota pengeluaran: kasir boleh unggah & lihat di folder expenses/ (bucket receipts privat).
create policy receipts_cashier_expense_write on storage.objects for insert to authenticated
  with check (bucket_id = 'receipts' and auth_role() = 'cashier' and name like 'expenses/%');
create policy receipts_cashier_expense_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and auth_role() = 'cashier' and name like 'expenses/%');

create function add_expense(p_date date, p_category text, p_description text, p_amount bigint, p_source text, p_receipt_path text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r app_role := auth_role(); d date := coalesce(p_date, jkt_today()); st settings; id uuid;
begin
  perform require_role('manager', 'cashier');
  if d > jkt_today() then raise exception 'Tanggal pengeluaran tidak boleh di masa depan'; end if;
  select * into st from settings;
  if p_amount > st.receipt_required_above and coalesce(p_receipt_path, '') = '' then
    raise exception 'Foto nota wajib untuk pengeluaran di atas Rp%', to_char(st.receipt_required_above, 'FM999G999G999');
  end if;
  if r = 'cashier' then
    if d <> jkt_today() then raise exception 'Kasir hanya mencatat pengeluaran hari ini'; end if;
    if p_source <> 'laci' then raise exception 'Kasir hanya mencatat pengeluaran dari laci kas'; end if;
    if p_amount > st.petty_cash_limit then
      raise exception 'Di atas batas kas kecil (Rp%) — minta manajer mencatatnya', to_char(st.petty_cash_limit, 'FM999G999G999');
    end if;
  end if;
  if p_source = 'laci' and exists (select 1 from cash_closings where date = d) then
    raise exception 'Kasir tanggal ini sudah ditutup — pengeluaran dari laci tidak bisa ditambah lagi';
  end if;
  insert into expenses (date, category, description, amount, source, receipt_path)
  values (d, p_category, trim(p_description), p_amount, p_source, nullif(p_receipt_path, ''))
  returning expenses.id into id;
  return id;
end $$;

create function void_expense(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare e expenses;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan pembatalan wajib diisi'; end if;
  select * into e from expenses where id = p_id for update;
  if not found or e.voided_at is not null then raise exception 'Pengeluaran tidak ditemukan atau sudah dibatalkan'; end if;
  if e.source = 'laci' and exists (select 1 from cash_closings where date = e.date) then
    raise exception 'Tutup kasir tanggal itu sudah final — pengeluaran laci tidak bisa dibatalkan';
  end if;
  update expenses set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;
-- Batas untuk petunjuk di layar (kasir tidak bisa membaca tabel settings).
create function expense_limits() returns table (petty_cash_limit bigint, receipt_required_above bigint)
language sql stable security definer set search_path = public as $$
  select s.petty_cash_limit, s.receipt_required_above from settings s where auth_role() in ('manager', 'cashier')
$$;
revoke execute on function add_expense(date, text, text, bigint, text, text), void_expense(uuid, text), expense_limits() from public, anon;

-- Tutup kasir: pengeluaran dari laci mengurangi kas diharapkan. Laporan owner: pengeluaran operasional per kategori.
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['cash_summary_full', $a$       tp as (select * from deposit_topups where created_at >= t0 and created_at < t1)$a$,
          $a$       tp as (select * from deposit_topups where created_at >= t0 and created_at < t1),
       ex as (select * from expenses where date = p_date and source = 'laci' and voided_at is null)$a$],
    array['cash_summary_full', $a$'topup_count', (select count(*) from tp),$a$,
          $a$'topup_count', (select count(*) from tp),
    'expense_cash', (select coalesce(sum(amount), 0) from ex),
    'expense_count', (select count(*) from ex),$a$],
    array['cash_summary_full', $a$(r ->> 'cash_sales')::bigint + (r ->> 'topup_cash')::bigint)$a$,
          $a$(r ->> 'cash_sales')::bigint + (r ->> 'topup_cash')::bigint - (r ->> 'expense_cash')::bigint)$a$],
    array['owner_finance', $a$'maintenance_cost', $a$,
          $a$'expenses_total', (select coalesce(sum(e.amount), 0) from expenses e where e.voided_at is null and e.date between p_from and p_to),
    'expenses_by_category', (select coalesce(jsonb_agg(jsonb_build_object('category', x.category, 'amount', x.amount) order by x.amount desc), '[]')
                             from (select e.category, sum(e.amount)::bigint as amount from expenses e
                                   where e.voided_at is null and e.date between p_from and p_to group by e.category) x),
    'maintenance_cost', $a$]
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
