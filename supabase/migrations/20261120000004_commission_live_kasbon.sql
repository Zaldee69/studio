-- T-01900551 (Opsi A): perbaiki dobel potong kasbon. Satu kasbon menulis DUA catatan potong: expenses (dibawa lintas bulan oleh
-- commission_week_rows ke komisi mingguan) dan payroll_adjustments (dibaca commission_live → total_pay). Utang kasbon staf non-bulanan
-- sudah dilacak penuh jalur mingguan, jadi adjustments kasbon mereka TIDAK ikut total_pay lagi. pay_monthly (tak ikut jalur mingguan)
-- tetap lewat adjustments. Tidak ada perubahan data; baris payroll_adjustments tetap ada (jejak). Snapshot periode closed tidak berubah.
-- Hanya commission_live yang berubah (commission_week_rows / commission_week_close / payroll_close persis sama).
--
-- Yang dikecualikan = adjustment yang ditautkan expenses.adjustment_id (kategori kasbon) DAN expense-nya belum di-void.
-- Kasbon yang di-void: baris asli (−X) + koreksi "Batal kasbon" (+X, tak tertaut expenses) keduanya dihitung → net 0, tanpa menebak teks alasan.
-- Kasbon lama tanpa adjustment (adjustment_id NULL) tak tersentuh.
-- ponytail: dependensi pada expenses.adjustment_id; bila ada jalur kasbon baru yang menulis adjustment tanpa tautan itu, jalur tsb tetap dobel.
--
-- ROLLBACK (kembalikan definisi sebelumnya = hasil 20261101000001_hapus_jaring_bulanan.sql; hanya fungsi, tanpa DDL data):
--   create or replace function commission_live(p_month date) ... (sama persis di bawah, ganti subquery `adj` dengan:)
--   coalesce((select sum(a.amount) from payroll_adjustments a where a.staff_id = s.id and a.month = date_trunc('month', p_month)::date), 0)::bigint as adj,
--   (tanpa kondisi `and (s.pay_monthly or not exists (...))`). Salinan definisi lama utuh ada di akhir berkas ini (komentar).

create or replace function commission_live(p_month date)
returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int,
               revenue_net bigint, hpp_total bigint, base_salary bigint, commission_service bigint, commission_retail bigint,
               subsidy bigint, adjustments bigint, total_pay bigint)
language sql stable security definer set search_path = public as $$
  with st as (select * from settings), l as (select * from commission_lines(p_month)),
  m as (select date_trunc('month', p_month)::date as m0),
  ds as (select x.staff_id, x.subsidy from m, lateral daily_net_subsidy(m.m0, (m.m0 + interval '1 month - 1 day')::date) x),
  agg as (
    select s.id, s.name, s.category, coalesce(s.commission_pct_override, st.commission_pct)::numeric as pct,
           count(l.*) filter (where l.category <> 'retail')::int as n,
           coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint as net,
           coalesce(sum(l.hpp) filter (where l.category <> 'retail'), 0)::bigint as hpp,
           coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint as cs,
           coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint as cr,
           coalesce((select sum(a.amount) from payroll_adjustments a
                     where a.staff_id = s.id and a.month = date_trunc('month', p_month)::date
                       and (s.pay_monthly or not exists (select 1 from expenses e
                                                          where e.adjustment_id = a.id and e.category = 'kasbon' and e.voided_at is null))), 0)::bigint as adj,
           st.min_monthly_pay as minpay, s.daily_min_pay is not null as daily, s.base_salary, s.active, count(l.*) as any_items
    from staff s cross join st left join l on l.staff_id = s.id
    group by s.id, st.commission_pct, st.min_monthly_pay
  ),
  sub as (select agg.*, case when agg.base_salary is not null then 0
                             when agg.daily then coalesce((select ds.subsidy from ds where ds.staff_id = agg.id), 0)
                             else 0 end::bigint as subsidy,
                        coalesce(agg.base_salary, 0)::bigint as base from agg)
  select id, name, category, pct, n, net, hpp, base, cs, cr, subsidy, adj, (base + cs + cr + subsidy + adj)::bigint
  from sub where active or any_items > 0 or adj <> 0
$$;

-- DEFINISI LAMA (rollback; jalankan sebagai create or replace function commission_live ... tanpa tanda komentar):
-- create or replace function commission_live(p_month date)
-- returns table (staff_id uuid, staff_name text, category staff_category, commission_pct numeric, service_count int,
--                revenue_net bigint, hpp_total bigint, base_salary bigint, commission_service bigint, commission_retail bigint,
--                subsidy bigint, adjustments bigint, total_pay bigint)
-- language sql stable security definer set search_path = public as $$
--   with st as (select * from settings), l as (select * from commission_lines(p_month)),
--   m as (select date_trunc('month', p_month)::date as m0),
--   ds as (select x.staff_id, x.subsidy from m, lateral daily_net_subsidy(m.m0, (m.m0 + interval '1 month - 1 day')::date) x),
--   agg as (
--     select s.id, s.name, s.category, coalesce(s.commission_pct_override, st.commission_pct)::numeric as pct,
--            count(l.*) filter (where l.category <> 'retail')::int as n,
--            coalesce(sum(l.net_amount) filter (where l.category <> 'retail'), 0)::bigint as net,
--            coalesce(sum(l.hpp) filter (where l.category <> 'retail'), 0)::bigint as hpp,
--            coalesce(sum(l.commission) filter (where l.category <> 'retail'), 0)::bigint as cs,
--            coalesce(sum(l.commission) filter (where l.category = 'retail'), 0)::bigint as cr,
--            coalesce((select sum(a.amount) from payroll_adjustments a where a.staff_id = s.id and a.month = date_trunc('month', p_month)::date), 0)::bigint as adj,
--            st.min_monthly_pay as minpay, s.daily_min_pay is not null as daily, s.base_salary, s.active, count(l.*) as any_items
--     from staff s cross join st left join l on l.staff_id = s.id
--     group by s.id, st.commission_pct, st.min_monthly_pay
--   ),
--   sub as (select agg.*, case when agg.base_salary is not null then 0
--                              when agg.daily then coalesce((select ds.subsidy from ds where ds.staff_id = agg.id), 0)
--                              else 0 end::bigint as subsidy,
--                         coalesce(agg.base_salary, 0)::bigint as base from agg)
--   select id, name, category, pct, n, net, hpp, base, cs, cr, subsidy, adj, (base + cs + cr + subsidy + adj)::bigint
--   from sub where active or any_items > 0 or adj <> 0
-- $$;
