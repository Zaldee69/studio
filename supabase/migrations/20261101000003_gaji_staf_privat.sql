-- Audit 31 Okt (SEC-1): kasir bisa membaca gaji & skema komisi semua staf (grant SELECT seluruh tabel + policy cashier_read).
-- Hak baca per kolom: login biasa hanya kolom identitas/operasional; gaji, aturan komisi & No. WA staf dibaca manajer lewat staff_private().
-- Fungsi definer (komisi, rapor, laporan) tidak terpengaruh. anon tidak punya policy staf → tidak perlu SELECT.
revoke select on staff from anon, authenticated;
grant select (id, name, category, active, sort, created_at, photo_path, home_resource_id) on staff to authenticated;

create function staff_private() returns table (id uuid, whatsapp text, base_salary bigint, commission_pct_override int, daily_min_pay bigint,
  retail_pct_override numeric, deduct_hpp boolean, pay_monthly boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  return query select s.id, s.whatsapp, s.base_salary, s.commission_pct_override, s.daily_min_pay, s.retail_pct_override, s.deduct_hpp, s.pay_monthly from staff s;
end $$;
revoke execute on function staff_private() from public, anon;
grant execute on function staff_private() to authenticated;
