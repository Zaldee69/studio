-- Laporan owner: arus kas mencakup gaji akhir bulan yang dibayar di periode itu (selama ini hanya komisi mingguan).
-- Dibayar akhir bulan = total gaji bulan itu − komisi yang sudah ditutup mingguan untuk bulan itu (dibayar terpisah).
do $$
declare def text; old text;
begin
  select pg_get_functiondef('owner_report_extra'::regproc) into def;
  old := def;
  def := replace(def, $a$    'campaign_sends',$a$,
    $a$    'payroll_paid', (select coalesce(sum(greatest(0, ps.total_pay - coalesce((select sum(c.amount) from commission_week_pays c
                                                where c.staff_id = ps.staff_id and c.month = pp.month), 0))), 0)::bigint
                     from payroll_snapshots ps join payroll_periods pp on pp.id = ps.period_id
                     where ps.paid_at >= a0 and ps.paid_at < a1),
    'campaign_sends',$a$);
  if def = old then raise exception 'Patch owner_report_extra tidak menemukan teks'; end if;
  execute def;
end $$;

-- Arus kas "pembelian stok": hanya stok masuk dengan sumber dana tercatat (paid_from). Stok awal / data lama
-- (sebelum kolom "Dibayar dari") bukan pembelian di periode itu — tidak dihitung sebagai uang keluar.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('owner_report_extra'::regproc) into def;
  old := def;
  def := replace(def, $a$from stock_moves where type = 'in' and created_at >= a0 and created_at < a1)$a$,
                      $a$from stock_moves where type = 'in' and paid_from is not null and created_at >= a0 and created_at < a1)$a$);
  if def = old then raise exception 'Patch owner_report_extra (stok) tidak menemukan teks'; end if;
  execute def;
end $$;
