-- Laporan owner mingguan/bulanan (PDF untuk owner): angka tambahan + catatan manajer per periode.
-- Angka di sini melengkapi owner_report(); definisi lain tidak berubah.

-- Catatan manajer per periode: ringkasan eksekutif, masalah & tindakan, keputusan owner, prioritas, evaluasi.
create table owner_report_notes (
  kind text not null check (kind in ('minggu', 'bulan')),
  period_start date not null,
  data jsonb not null default '{}',
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (kind, period_start)
);
alter table owner_report_notes enable row level security;
create policy manager_all on owner_report_notes for all to authenticated
  using (auth_role() = 'manager') with check (auth_role() = 'manager');
create trigger audit_owner_report_notes after update on owner_report_notes for each row execute function audit_row();

-- Angka yang belum ada di owner_report(): realisasi booking, komisi periode, arus kas komisi mingguan, selisih kas, kampanye.
create function owner_report_extra(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare a0 timestamptz := jkt(p_from, '00:00'); a1 timestamptz := jkt(p_to + 1, '00:00'); r jsonb;
begin
  perform require_role('manager');
  with ap as (select * from appointments where start_at >= a0 and start_at < a1),
  -- komisi estimasi: baris komisi bulan-bulan yang tersentuh periode, dipotong ke rentang tanggal (sebelum subsidi gaji minimum)
  months as (select distinct date_trunc('month', g)::date as m from generate_series(p_from, p_to, interval '1 day') g),
  cl as (select l.* from months, lateral commission_lines(months.m) l where l.created_at >= a0 and l.created_at < a1),
  cc as (select distinct on (date) date, difference from cash_closings where date between p_from and p_to order by date, created_at desc),
  txd as (select distinct (created_at at time zone 'Asia/Jakarta')::date as d from transactions where created_at >= a0 and created_at < a1 and voided_at is null)
  select jsonb_build_object(
    'bookings', (select count(*) filter (where status not in ('cancelled', 'pending_review')) from ap),
    'bookings_paid', (select count(*) filter (where status = 'paid') from ap),
    'bookings_cancelled', (select count(*) filter (where status = 'cancelled') from ap),
    'bookings_no_show', (select count(*) filter (where status = 'no_show') from ap),
    'bookings_walk_in', (select count(*) filter (where source = 'walk_in' and status <> 'cancelled') from ap),
    'commission_est', (select coalesce(sum(commission), 0) from cl),
    'commission_weekly_paid', (select coalesce(sum(amount), 0) from commission_week_pays where paid_at >= a0 and paid_at < a1),
    'cash_days', (select count(*) from txd),
    'cash_days_closed', (select count(*) from cc),
    'cash_days_unclosed', (select count(*) from txd where d not in (select date from cc) and d < jkt_today()),
    'cash_diff_total', (select coalesce(sum(difference), 0) from cc),
    'cash_diff_abs', (select coalesce(sum(abs(difference)), 0) from cc),
    'campaign_sends', (select count(*) from campaign_sends where created_at >= a0 and created_at < a1),
    'campaign_recipients', (select coalesce(sum(recipient_count), 0) from campaign_sends where created_at >= a0 and created_at < a1)
  ) into r;
  return r;
end $$;
revoke execute on function owner_report_extra(date, date) from public, anon;
