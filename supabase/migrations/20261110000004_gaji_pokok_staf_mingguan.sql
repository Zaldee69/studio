-- Staf bergaji pokok yang komisinya dibayar MINGGUAN (Irga, permintaan 10 Nov): komisi ditutup tiap minggu, gaji pokok dibayar
-- akhir bulan (SDM → Bulanan & bonus kasir: sisa = total − dibayar mingguan). owner_payroll dulu hanya menghitung bayaran
-- mingguan untuk staf non-bulanan → gaji pokoknya hilang dari biaya staf laporan owner. Sekarang ditambah sebagai baris tersendiri.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('owner_payroll(date,date)'::regprocedure) into def;
  old := def;
  def := replace(def,
    $a$    join staff s on s.id = p.staff_id and not s.pay_monthly
    group by p.month, p.staff_id, o.open
  )$a$,
    $a$    join staff s on s.id = p.staff_id and not s.pay_monthly
    group by p.month, p.staff_id, o.open
    union all
    select m.month, x.staff_id, x.closed, x.base_salary, 0, 0, 0, 0
    from m cross join lateral commission_for_period(m.month) x
    join staff s on s.id = x.staff_id and not s.pay_monthly and coalesce(x.base_salary, 0) > 0
  )$a$);
  if def = old then raise exception 'Patch owner_payroll tidak menemukan teks'; end if;
  execute def;
end $$;
