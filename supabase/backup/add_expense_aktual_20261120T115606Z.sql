CREATE OR REPLACE FUNCTION public.add_expense(p_date date, p_category text, p_description text, p_amount bigint, p_source text, p_receipt_path text DEFAULT NULL::text, p_staff_id uuid DEFAULT NULL::uuid, p_template_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r app_role := auth_role(); d date := coalesce(p_date, jkt_today()); st settings; id uuid; adj uuid; who text;
begin
  perform require_role('manager', 'cashier');
  if p_category = 'kasbon' and (select kasbon_flow_on from settings) then
    raise exception 'Kasbon lewat pengajuan (menu Kasbon) — tidak bisa dicatat langsung sebagai pengeluaran';
  end if;
  if d > jkt_today() then raise exception 'Tanggal pengeluaran tidak boleh di masa depan'; end if;
  select * into st from settings;
  if p_amount > st.receipt_required_above and coalesce(p_receipt_path, '') = '' then
    raise exception 'Foto nota wajib untuk pengeluaran di atas Rp%', to_char(st.receipt_required_above, 'FM999G999G999');
  end if;
  if r = 'cashier' then
    if d <> jkt_today() then raise exception 'Kasir hanya mencatat pengeluaran hari ini'; end if;
    if p_source <> 'laci' and coalesce(p_receipt_path, '') = '' then raise exception 'Foto nota wajib untuk pengeluaran non-laci'; end if;
    if p_source = 'laci' and p_amount > st.petty_cash_limit then
      raise exception 'Di atas batas kas kecil (Rp%) — minta manajer mencatatnya', to_char(st.petty_cash_limit, 'FM999G999G999');
    end if;
  end if;
  if p_source = 'laci' and r <> 'manager' and exists (select 1 from cash_closings where date = d) then
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
  if p_template_id is not null and r <> 'manager' then raise exception 'Pengeluaran rutin dicatat manajer'; end if;
  insert into expenses (date, category, description, amount, source, receipt_path, staff_id, adjustment_id, template_id)
  values (d, p_category, trim(p_description), p_amount, p_source, nullif(p_receipt_path, ''), p_staff_id, adj, p_template_id)
  returning expenses.id into id;
  return id;
end $function$
;
