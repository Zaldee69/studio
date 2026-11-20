-- Rekonsiliasi kasbon per staf per bulan (read-only, informasi; jalankan sebelum & sesudah migrasi kasbon_approval, selisih historis dicatat, tidak diubah).
-- exp = expenses kasbon non-void (utang komisi mingguan), adj = potongan payroll_adjustments (gaji bulanan), wk = sudah dipotong di commission_week_pays.
-- adj > wk untuk staf non-bulanan = kandidat dobel potong (monthly total_pay sudah net adj, sisa utang komisi dipotong lagi minggu depan).
with e as (select staff_id, date_trunc('month', date)::date m, sum(amount) exp from expenses where category = 'kasbon' and voided_at is null group by 1, 2),
     a as (select staff_id, month m, -sum(amount) adj from payroll_adjustments where kind = 'deduction' and reason like 'Kasbon%' group by 1, 2),
     w as (select staff_id, month m, sum(kasbon) wk from commission_week_pays group by 1, 2)
select s.name, m, coalesce(exp, 0) exp, coalesce(adj, 0) adj, coalesce(wk, 0) wk
from e full join a using (staff_id, m) full join w using (staff_id, m) join staff s on s.id = staff_id
order by m, s.name;
