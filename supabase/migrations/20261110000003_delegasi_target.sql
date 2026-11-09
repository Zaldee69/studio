-- Delegasi target & tugas ke kasir/capster (manajer 10 Nov: "saya ingin 1 dan 2").
--  1. manager_tasks bisa ditugaskan ke satu akun (assigned_to) atau satu peran (assigned_role: semua kasir / semua capster).
--     Yang ditugasi melihat tugasnya di layar Kasir → "Target & tugas" / HP capster → Hari ini, dan hanya boleh mengubah
--     status & catatan (dijaga trigger, bukan hanya tampilan). Riwayat (manager_task_log) mencatat nama mereka.
--  2. Target pribadi dihitung dari data (my_targets): kasir = % transaksi ber-WA & % pelanggan dibookingkan jadwal berikutnya hari ini;
--     capster/terapis = layanan minggu ini vs target pribadi + pelanggan yang kembali ke dia. Hanya angka sendiri — perbandingan
--     antar-staf tetap hanya untuk manajer (keputusan owner 31 Okt). Tanpa insentif baru (keputusan owner 30 Okt; bonus 1% Dwi terpisah).

alter table manager_tasks
  add column assigned_to uuid references profiles (id),
  add column assigned_role app_role check (assigned_role in ('cashier', 'staff'));
comment on column manager_tasks.assigned_to is 'Akun yang ditugasi (kasir/capster); null = manajer.';
comment on column manager_tasks.assigned_role is 'Ditugaskan ke semua akun peran ini (cashier/staff) bila akun perorangan belum ada.';

drop policy manager_all on manager_tasks;
drop policy manager_update on manager_tasks;
create policy read_mine on manager_tasks for select to authenticated
  using (auth_role() = 'manager' or assigned_to = auth.uid() or (assigned_role is not null and assigned_role = auth_role()));
create policy update_mine on manager_tasks for update to authenticated
  using (auth_role() = 'manager' or assigned_to = auth.uid() or (assigned_role is not null and assigned_role = auth_role()))
  with check (auth_role() = 'manager' or assigned_to = auth.uid() or (assigned_role is not null and assigned_role = auth_role()));

-- yang ditugasi hanya mengubah status & catatan (berjalan sebelum manager_tasks_stamp: urutan nama trigger)
create function manager_tasks_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and auth_role() is distinct from 'manager'
     and (new.title, new.pic, new.due, new.measure, new.grows_customers, new.assigned_to, new.assigned_role)
         is distinct from (old.title, old.pic, old.due, old.measure, old.grows_customers, old.assigned_to, old.assigned_role) then
    raise exception 'Hanya manajer yang bisa mengubah isi tugas' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger manager_tasks_guard before update on manager_tasks for each row execute function manager_tasks_guard();

-- target pribadi
alter table staff add column target_cuts_weekly int check (target_cuts_weekly between 0 and 500);
comment on column staff.target_cuts_weekly is 'Target layanan per minggu untuk staf ini; null = target studio dibagi capster barbershop aktif (terapis: tanpa target).';
alter table settings add column target_rebook_pct int not null default 20 check (target_rebook_pct between 0 and 100);
comment on column settings.target_rebook_pct is 'Target % pelanggan yang dibookingkan jadwal berikutnya oleh kasir saat bayar.';

create function my_targets() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  r app_role := auth_role(); d date := jkt_today(); w0 date := date_trunc('week', jkt_today())::date;
  sid uuid := my_staff_id(); out jsonb;
begin
  if r = 'cashier' then
    with tx as (select t.customer_id from transactions t
                where t.voided_at is null and t.created_at >= jkt(d, '00:00') and t.created_at < jkt(d + 1, '00:00')),
    paid as (select distinct customer_id from tx where customer_id is not null),
    rebook as (select distinct a.customer_id from appointments a join paid p on p.customer_id = a.customer_id
               where a.created_at >= jkt(d, '00:00') and a.start_at >= jkt(d + 1, '00:00') and a.status <> 'cancelled')
    select jsonb_build_object('role', 'cashier', 'date', d,
      'tx', (select count(*) from tx),
      'tx_with_wa', (select count(*) from tx join customers c on c.id = tx.customer_id where c.whatsapp is not null),
      'customers', (select count(*) from paid),
      'rebooked', (select count(*) from rebook),
      'target_wa_pct', s.target_customer_pct, 'target_rebook_pct', s.target_rebook_pct)
    into out from settings s;
  elsif r = 'staff' and sid is not null then
    with mine as (
      select t.customer_id, t.created_at from transactions t join transaction_items ti on ti.transaction_id = t.id
      join services sv on sv.id = ti.service_id
      where t.voided_at is null and ti.staff_id = sid and t.created_at >= jkt(w0, '00:00') and t.created_at < jkt(w0 + 7, '00:00')
        and (sv.is_cut or sv.category <> 'barbershop')),
    back as (select distinct m.customer_id from mine m where m.customer_id is not null and exists (
      select 1 from transactions t join transaction_items ti on ti.transaction_id = t.id
      where t.voided_at is null and ti.staff_id = sid and t.customer_id = m.customer_id and t.created_at < jkt(w0, '00:00')))
    select jsonb_build_object('role', 'staff', 'week', w0,
      'done', (select count(*) from mine),
      'returning', (select count(*) from back),
      'target', coalesce(st.target_cuts_weekly, case when st.category = 'barbershop' then
        ceil(s.target_cuts_weekly::numeric / greatest(1, (select count(*) from staff x where x.active and x.category = 'barbershop'))) end))
    into out from staff st, settings s where st.id = sid;
  end if;
  return out;
end $$;
revoke execute on function my_targets() from public, anon;
grant execute on function my_targets() to authenticated;
