CREATE OR REPLACE FUNCTION public.void_expense(p_id uuid, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
end $function$
;
