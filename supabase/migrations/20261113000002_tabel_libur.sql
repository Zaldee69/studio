-- Tabel jadwal libur (13 Nov): capster & kasir melihat jadwal libur semua orang dalam bentuk tabel per minggu,
-- jadi day_off_board mengirim semua staf aktif + kasir (bukan hanya dirinya), tanda 'me', dan pemilik tiap baris libur.
-- Hanya nama, bidang & hari libur tetap — tanpa upah atau alasan izin.
-- Pengajuan tukar menyimpan tanggal asal & tujuan saat diajukan: setelah disetujui baris libur sudah pindah,
-- jadi tanggal yang dibaca dari baris libur menampilkan "26 Nov → 26 Nov".

alter table day_off_swaps add column from_date date, add column to_date date;
create function day_off_swap_dates() returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.from_date := (select (start_at at time zone 'Asia/Jakarta')::date from staff_time_off where id = new.off_id);
  new.to_date := coalesce(new.new_date, (select (start_at at time zone 'Asia/Jakarta')::date from staff_time_off where id = new.partner_off_id));
  return new;
end $$;
create trigger day_off_swap_dates before insert on day_off_swaps for each row execute function day_off_swap_dates();
update day_off_swaps s set from_date = (o.start_at at time zone 'Asia/Jakarta')::date,
  to_date = coalesce(s.new_date, (select (p.start_at at time zone 'Asia/Jakarta')::date from staff_time_off p where p.id = s.partner_off_id))
from staff_time_off o where o.id = s.off_id and s.from_date is null;

create or replace function day_off_board(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mgr boolean;
begin
  perform require_role('manager', 'cashier', 'staff');
  mgr := auth_role() = 'manager';
  return jsonb_build_object(
    'offs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'staff_id', o.staff_id, 'profile_id', o.profile_id, 'name', coalesce(st.name, pr.full_name), 'group', off_group(o.staff_id, o.profile_id),
        'kind', o.kind, 'start_at', o.start_at, 'end_at', o.end_at, 'swapped', o.swapped,
        'mine', owns_off(o.staff_id, o.profile_id),
        'bookings', case when mgr and o.staff_id is not null then (
          select count(*) from appointments a where a.staff_id = o.staff_id and a.status not in ('cancelled', 'paid', 'no_show')
            and a.start_at < o.end_at and a.end_at > o.start_at) else 0 end
      ) order by o.start_at, coalesce(st.name, pr.full_name))
      from staff_time_off o left join staff st on st.id = o.staff_id left join profiles pr on pr.id = o.profile_id
      where o.status = 'approved' and o.all_day and (st.id is null or st.active)
        and o.start_at < jkt(p_to + 1, '00:00') and o.end_at > jkt(p_from, '00:00')), '[]'),
    'swaps', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'status', s.status, 'partner_ok', s.partner_ok, 'reason', s.reason, 'created_at', s.created_at,
        'name', coalesce(st.name, pr.full_name), 'from_date', s.from_date,
        'new_date', s.to_date,
        'partner', coalesce((select name from staff where id = p.staff_id), (select full_name from profiles where id = p.profile_id)),
        'mine', s.requested_by = auth.uid(), 'to_me', p.id is not null and owns_off(p.staff_id, p.profile_id),
        'bookings', case when mgr and s.status = 'pending' then (
          select count(*) from appointments a
          where a.status not in ('cancelled', 'paid', 'no_show') and (
            (a.staff_id = o.staff_id and a.start_at >= jkt(coalesce(s.new_date, (p.start_at at time zone 'Asia/Jakarta')::date), '00:00')
                                     and a.start_at <  jkt(coalesce(s.new_date, (p.start_at at time zone 'Asia/Jakarta')::date) + 1, '00:00'))
            or (a.staff_id = p.staff_id and a.start_at >= o.start_at and a.start_at < o.end_at))) else 0 end
      ) order by s.created_at desc)
      from day_off_swaps s join staff_time_off o on o.id = s.off_id left join staff_time_off p on p.id = s.partner_off_id
      left join staff st on st.id = o.staff_id left join profiles pr on pr.id = o.profile_id
      where (s.status = 'pending' or s.created_at > now() - interval '30 days')
        and (mgr or s.requested_by = auth.uid() or (p.id is not null and owns_off(p.staff_id, p.profile_id)))), '[]'),
    'people', coalesce((
      select jsonb_agg(x order by x ->> 'group', x ->> 'name') from (
        select jsonb_build_object('staff_id', s.id, 'profile_id', null, 'name', s.name, 'group', s.category, 'day_off', s.day_off, 'me', s.id is not distinct from my_staff_id()) x
        from staff s where s.active
        union all
        select jsonb_build_object('staff_id', null, 'profile_id', p.id, 'name', p.full_name, 'group', 'cashier', 'day_off', p.day_off, 'me', p.id = auth.uid())
        from profiles p where p.active and p.role = 'cashier') q), '[]'));
end $$;
