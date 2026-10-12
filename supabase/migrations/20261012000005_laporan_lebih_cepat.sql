-- Laporan owner periode panjang lambat (data 12 bulan, ±10rb transaksi: ±11 detik). Hasil fungsi TIDAK berubah.
--   owner_daily : subquery per hari × 13 metrik (365 × 13 pindaian) → satu agregasi per hari (±4 dtk → puluhan ms).
--   kpi_heatmap : appt_interval(...).* memanggil fungsi 2× per booking → lateral, sekali per booking (±1,7 → ±0,7 dtk).

create or replace function owner_daily(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with d as (select g::date as day from generate_series(p_from, p_to, interval '1 day') g),
  tx as (select (t.created_at at time zone 'Asia/Jakarta')::date as day, t.*
         from transactions t where t.created_at >= jkt(p_from, '00:00') and t.created_at < jkt(p_to + 1, '00:00')),
  t as (select day,
          count(*) filter (where voided_at is null) as tx,
          count(*) filter (where voided_at is not null) as void,
          coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('cash', 'deposit_cash')), 0) as cash,
          coalesce(sum(paid_amount) filter (where voided_at is null and payment_method in ('qris', 'deposit_qris')), 0) as qris,
          coalesce(sum(deposit_used) filter (where voided_at is null), 0) as deposit
        from tx group by day),
  i as (select tx.day,
          sum(ti.net_amount) as net,
          coalesce(sum(ti.net_amount) filter (where ti.category = 'barbershop'), 0) as barbershop,
          coalesce(sum(ti.net_amount) filter (where ti.category = 'nail'), 0) as nail,
          coalesce(sum(ti.net_amount) filter (where ti.category = 'massage'), 0) as massage,
          coalesce(sum(ti.net_amount) filter (where ti.category = 'retail'), 0) as retail,
          sum(ti.discount_share) as discount, sum(coalesce(c.hpp, 0)) as hpp
        from tx join transaction_items ti on ti.transaction_id = tx.id
        left join transaction_item_costs c on c.transaction_item_id = ti.id
        where tx.voided_at is null group by tx.day)
  select coalesce(jsonb_agg(jsonb_build_object(
    'day', d.day, 'tx', coalesce(t.tx, 0), 'net', coalesce(i.net, 0),
    'barbershop', coalesce(i.barbershop, 0), 'nail', coalesce(i.nail, 0), 'massage', coalesce(i.massage, 0), 'retail', coalesce(i.retail, 0),
    'discount', coalesce(i.discount, 0), 'hpp', coalesce(i.hpp, 0), 'void', coalesce(t.void, 0),
    'cash', coalesce(t.cash, 0), 'qris', coalesce(t.qris, 0), 'deposit', coalesce(t.deposit, 0)) order by d.day), '[]')
  from d left join t on t.day = d.day left join i on i.day = d.day
$$;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('kpi_heatmap'::regproc) into def;
  old := def;
  def := replace(def, $a$    select (appt_interval(a, now())).* from appointments a join resources x on x.id = a.resource_id$a$,
                      $a$    select iv.s, iv.e from appointments a join resources x on x.id = a.resource_id cross join lateral appt_interval(a, now()) iv$a$);
  if def = old then raise exception 'Patch kpi_heatmap tidak menemukan teks'; end if;
  execute def;
end $$;
