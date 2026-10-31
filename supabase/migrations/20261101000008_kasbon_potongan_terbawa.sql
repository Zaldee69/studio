-- Audit UANG-5 + UANG-3 pilihan B (1 Nov):
--  1. Kasbon dipotong dari saldo utang per staf lintas bulan (dulu hanya dari minggu yang bulannya sama dengan kasbon →
--     kasbon akhir bulan tanpa layanan minggu itu tidak pernah terpotong, mis. Abdu 30 Okt Rp10 rb).
--  2. Void transaksi dari minggu yang komisinya sudah dibayar tidak lagi ditolak: komisinya menjadi potongan (commission_deductions)
--     yang dipotong di bayaran minggu berikutnya lewat saldo yang sama.
-- ponytail: kolom commission_week_pays.kasbon kini = kasbon + potongan; rekonsiliasi gaji bulanan (tidak dipakai sejak 25 Okt) per bulan bisa selisih bila kasbon lintas bulan.
create table commission_deductions (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id),
  amount bigint not null check (amount > 0),
  reason text not null check (length(trim(reason)) > 0),
  transaction_id uuid references transactions (id),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
alter table commission_deductions enable row level security;
create policy manager_read on commission_deductions for select to authenticated using (auth_role() = 'manager');
create trigger audit_commission_deductions after insert or update or delete on commission_deductions for each row execute function audit_row();

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['commission_week_rows(date)',
          $a$  k as (select e.staff_id, date_trunc('month', e.date)::date as month, sum(e.amount) as amt
        from expenses e, w where e.category = 'kasbon' and e.voided_at is null and e.date <= w.w0 + 6 group by 1, 2),
  prev as (select p.staff_id, p.month, sum(p.kasbon) as amt from commission_week_pays p, w where p.week_start <> w.w0 group by 1, 2),
  r as (select g.*, least(g.cs + g.cr + g.sub, greatest(0, coalesce(k.amt, 0) - coalesce(prev.amt, 0)))::bigint as kas
        from g left join k on k.staff_id = g.staff_id and k.month = g.month
               left join prev on prev.staff_id = g.staff_id and prev.month = g.month)$a$,
          $a$  -- saldo utang per staf (lintas bulan): kasbon + potongan s/d minggu ini − yang sudah dipotong di minggu sebelumnya
  k as (select x.staff_id, sum(x.amt) as amt from (
          select e.staff_id, e.amount as amt from expenses e, w where e.category = 'kasbon' and e.voided_at is null and e.date <= w.w0 + 6
          union all
          select d.staff_id, d.amount from commission_deductions d, w where d.created_at < jkt(w.w0 + 7, '00:00')) x group by 1),
  prev as (select p.staff_id, sum(p.kasbon) as amt from commission_week_pays p, w where p.week_start < w.w0 group by 1),
  o as (select g.*, greatest(0, coalesce(k.amt, 0) - coalesce(prev.amt, 0)) as owed,
               coalesce(sum(g.cs + g.cr + g.sub) over (partition by g.staff_id order by g.month rows between unbounded preceding and 1 preceding), 0) as before
        from g left join k on k.staff_id = g.staff_id left join prev on prev.staff_id = g.staff_id),
  r as (select o.staff_id, o.month, o.sc, o.net, o.cs, o.cr, o.sub, least(o.cs + o.cr + o.sub, greatest(0, o.owed - o.before))::bigint as kas from o)$a$],
    array['void_transaction(uuid,text)',
          $a$  if exists (select 1 from transaction_items ti join commission_week_pays w on w.staff_id = ti.staff_id
             and w.week_start = date_trunc('week', (tx_at at time zone 'Asia/Jakarta')::date)::date
             where ti.transaction_id = p_id) then
    raise exception 'Komisi minggu itu sudah dibayar ke %. Bicarakan potongan dengan staf dulu — void tidak bisa dilakukan.',
      (select string_agg(distinct s.name, ', ') from transaction_items ti join staff s on s.id = ti.staff_id
         join commission_week_pays w on w.staff_id = ti.staff_id and w.week_start = date_trunc('week', (tx_at at time zone 'Asia/Jakarta')::date)::date
       where ti.transaction_id = p_id);
  end if;$a$,
          $a$  -- komisi minggu yang sudah dibayar → potongan di bayaran minggu berikutnya (dihitung sebelum transaksi di-void)
  insert into commission_deductions (staff_id, amount, reason, transaction_id)
  select l.staff_id, sum(l.commission), 'Void transaksi ' || to_char(tx_at at time zone 'Asia/Jakarta', 'DD/MM') || ': ' || trim(p_reason), p_id
  from commission_lines(date_trunc('month', (tx_at at time zone 'Asia/Jakarta')::date)::date) l
  where l.transaction_id = p_id
    and exists (select 1 from commission_week_pays w where w.staff_id = l.staff_id
                  and w.week_start = date_trunc('week', (tx_at at time zone 'Asia/Jakarta')::date)::date)
  group by l.staff_id having sum(l.commission) > 0;$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(fn::regprocedure) into def;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % (%) tidak menemukan teks', i, fn; end if;
    execute def;
  end loop;
end $$;
