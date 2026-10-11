-- Kasbon staf: dicatat sebagai pengeluaran kategori 'kasbon' (uang keluar dari laci/kas toko/transfer, ikut tutup kasir),
-- sekaligus potongan gaji (payroll_adjustments 'deduction') di bulan tanggal kasbon → slip & layar kapster ikut otomatis.
-- Di laporan owner tetap dihitung sebagai biaya: gaji yang dilaporkan sudah dipotong kasbon, jadi kasbon + gaji = biaya staf sebenarnya.
-- Batal kasbon = koreksi +jumlah (penyesuaian gaji tidak pernah dihapus). Kasbon dipotong saat penyelesaian bulanan, bukan mingguan.

alter table expenses drop constraint expenses_category_check;
alter table expenses add constraint expenses_category_check check (category in ('sewa', 'listrik_air', 'internet_pulsa', 'perlengkapan',
  'kebersihan', 'konsumsi', 'pemasaran', 'transportasi', 'perbaikan', 'pajak_izin', 'kasbon', 'lainnya'));
alter table expenses add column staff_id uuid references staff (id),
  add column adjustment_id uuid references payroll_adjustments (id),
  add constraint expenses_kasbon_staff check ((category = 'kasbon') = (staff_id is not null));

drop function add_expense(date, text, text, bigint, text, text);
create function add_expense(p_date date, p_category text, p_description text, p_amount bigint, p_source text,
                            p_receipt_path text default null, p_staff_id uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare r app_role := auth_role(); d date := coalesce(p_date, jkt_today()); st settings; id uuid; adj uuid; who text;
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
  if p_category = 'kasbon' then
    select name into who from staff where staff.id = p_staff_id and active;
    if who is null then raise exception 'Pilih staf untuk kasbon'; end if;
    if exists (select 1 from payroll_periods where month = date_trunc('month', d)::date and status = 'closed') then
      raise exception 'Gaji bulan % sudah ditutup — kasbon tidak bisa dipotong', to_char(d, 'MM/YYYY');
    end if;
    insert into payroll_adjustments (staff_id, month, kind, amount, reason)
    values (p_staff_id, date_trunc('month', d)::date, 'deduction', -p_amount, 'Kasbon ' || to_char(d, 'DD/MM') || ': ' || trim(p_description))
    returning payroll_adjustments.id into adj;
  elsif p_staff_id is not null then
    raise exception 'Staf hanya untuk kategori kasbon';
  end if;
  insert into expenses (date, category, description, amount, source, receipt_path, staff_id, adjustment_id)
  values (d, p_category, trim(p_description), p_amount, p_source, nullif(p_receipt_path, ''), p_staff_id, adj)
  returning expenses.id into id;
  return id;
end $$;
revoke execute on function add_expense(date, text, text, bigint, text, text, uuid) from public, anon;

create or replace function void_expense(p_id uuid, p_reason text) returns void
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
  if e.adjustment_id is not null then
    if exists (select 1 from payroll_periods where month = date_trunc('month', e.date)::date and status = 'closed') then
      raise exception 'Gaji bulan itu sudah ditutup — buka ulang dulu untuk membatalkan kasbon';
    end if;
    insert into payroll_adjustments (staff_id, month, kind, amount, reason)
    values (e.staff_id, date_trunc('month', e.date)::date, 'correction', e.amount, 'Batal kasbon ' || to_char(e.date, 'DD/MM') || ': ' || trim(p_reason));
  end if;
  update expenses set voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason) where id = p_id;
end $$;
