-- Jadwal libur (13 Nov): hari libur tetap per orang (capster & kasir) + tukar libur dengan persetujuan manajer.
--  • Libur disimpan sebagai baris staff_time_off kind='libur' yang sudah disetujui → booking online, jadwal konter,
--    notifikasi & rekap hari kerja yang sudah membaca staff_time_off otomatis ikut, tanpa mengubah fungsi-fungsi itu.
--  • Kasir tidak punya baris staff → staff_time_off.profile_id (staff_id boleh kosong; pemakai lama mencocokkan staff_id).
--  • Baris dibuat 6 minggu ke depan oleh fill_days_off() (cron harian + saat manajer mengubah hari libur tetap).
--  • Tukar libur: pindah hari sendiri (minggu yang sama) atau saling tukar dengan rekan satu bidang; rekan setuju dulu
--    (khusus tukar), lalu manajer menyetujui.
-- Aturan (manajer 13 Nov): capster libur Senin–Kamis, satu capster per hari; kasir Selasa/Kamis, akhir pekan maks 1×/bulan.

alter table staff add column day_off smallint check (day_off between 1 and 7);
alter table profiles add column day_off smallint check (day_off between 1 and 7);

alter table staff_time_off alter column staff_id drop not null;
alter table staff_time_off
  add column profile_id uuid references profiles (id) on delete cascade,
  add column kind text not null default 'izin' check (kind in ('izin', 'libur')),
  add column swapped boolean not null default false,
  add constraint staff_time_off_one_owner check (num_nonnulls(staff_id, profile_id) = 1);
create index staff_time_off_libur_idx on staff_time_off (start_at) where kind = 'libur';

-- Bidang pemilik baris libur: kategori staf, atau 'cashier' untuk akun kasir.
create function off_group(p_staff uuid, p_profile uuid) returns text
language sql stable security definer set search_path = public as $$
  select case when p_staff is not null then (select category::text from staff where id = p_staff) else 'cashier' end
$$;

create function owns_off(p_staff uuid, p_profile uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_staff = my_staff_id(), false) or coalesce(p_profile = auth.uid(), false)
$$;

-- Cek aturan libur untuk satu tanggal. p_ignore = baris yang sedang dipindah (tidak dihitung bentrok).
create function check_day_off(p_staff uuid, p_profile uuid, p_date date, p_ignore uuid[]) returns void
language plpgsql stable security definer set search_path = public as $$
declare g text := off_group(p_staff, p_profile); dow int := extract(isodow from p_date);
begin
  if g = 'barbershop' then
    if dow > 4 then raise exception 'Capster hanya bisa libur Senin–Kamis'; end if;
    if exists (select 1 from staff_time_off o join staff s on s.id = o.staff_id
               where o.kind = 'libur' and o.status = 'approved' and s.category = 'barbershop' and s.active
                 and o.staff_id <> p_staff and not (o.id = any (p_ignore))
                 and o.start_at = jkt(p_date, '00:00')) then
      raise exception 'Sudah ada capster lain yang libur hari itu';
    end if;
  elsif g = 'cashier' then
    if dow not in (2, 4, 6, 7) then raise exception 'Kasir libur hanya Selasa atau Kamis (akhir pekan maks 1× sebulan)'; end if;
    if dow >= 6 and exists (select 1 from staff_time_off o
               where o.kind = 'libur' and o.status = 'approved' and o.profile_id = p_profile and not (o.id = any (p_ignore))
                 and extract(isodow from o.start_at at time zone 'Asia/Jakarta') >= 6
                 and date_trunc('month', o.start_at at time zone 'Asia/Jakarta') = date_trunc('month', p_date::timestamp)) then
      raise exception 'Libur akhir pekan kasir maksimal 1× sebulan';
    end if;
  end if;
end $$;

-- Isi baris libur mingguan sampai p_weeks minggu ke depan. Minggu yang sudah punya baris libur (termasuk hasil tukar)
-- dilewati, jadi aman dipanggil berulang.
create function fill_days_off(p_weeks int default 6) returns int
language plpgsql security definer set search_path = public as $$
declare n int; today date := jkt_today();
begin
  with people as (
    select s.id as sid, null::uuid as pid, s.day_off from staff s where s.active and s.day_off is not null
    union all
    select null, p.id, p.day_off from profiles p where p.active and p.role = 'cashier' and p.day_off is not null
  ), d as (
    select pe.*, (date_trunc('week', today::timestamp)::date + w * 7 + pe.day_off - 1) as day
    from people pe, generate_series(0, p_weeks) w
  )
  insert into staff_time_off (staff_id, profile_id, start_at, end_at, all_day, reason, status, kind, decided_at)
  select d.sid, d.pid, jkt(d.day, '00:00'), jkt(d.day + 1, '00:00'), true, 'Libur mingguan', 'approved', 'libur', now()
  from d
  where d.day >= today
    and not exists (select 1 from staff_time_off o
                    where o.kind = 'libur' and o.status = 'approved'
                      and o.staff_id is not distinct from d.sid and o.profile_id is not distinct from d.pid
                      and o.start_at >= jkt(date_trunc('week', d.day::timestamp)::date, '00:00')
                      and o.start_at <  jkt(date_trunc('week', d.day::timestamp)::date + 7, '00:00'));
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function fill_days_off(int) from public, anon, authenticated;
select cron.schedule('gb-libur-mingguan', '5 17 * * *', $$select public.fill_days_off()$$);  -- tiap hari 00.05 WIB

-- Manajer: atur hari libur tetap (1 = Senin … 7 = Minggu; null = tanpa libur tetap). Satu dari p_staff_id / p_profile_id.
create function set_day_off(p_staff_id uuid, p_profile_id uuid, p_day int) returns void
language plpgsql security definer set search_path = public as $$
declare g text;
begin
  perform require_role('manager');
  if num_nonnulls(p_staff_id, p_profile_id) <> 1 then raise exception 'Pilih satu orang'; end if;
  if p_profile_id is not null and not exists (select 1 from profiles where id = p_profile_id and role = 'cashier') then
    raise exception 'Libur tetap lewat akun hanya untuk kasir';
  end if;
  g := off_group(p_staff_id, p_profile_id);
  if p_day is not null then
    if g = 'barbershop' and p_day > 4 then raise exception 'Capster hanya bisa libur Senin–Kamis'; end if;
    if g = 'barbershop' and exists (select 1 from staff where active and category = 'barbershop' and day_off = p_day and id <> p_staff_id) then
      raise exception 'Sudah ada capster lain dengan libur tetap di hari itu';
    end if;
    if g = 'cashier' and p_day not in (2, 4) then raise exception 'Kasir libur tetap hanya Selasa atau Kamis'; end if;
  end if;

  if p_staff_id is not null then update staff set day_off = p_day where id = p_staff_id;
  else update profiles set day_off = p_day where id = p_profile_id; end if;

  -- Libur mendatang yang belum pernah ditukar dibuat ulang mengikuti hari baru.
  -- ponytail: libur minggu ini yang harinya sudah lewat tidak diganti; minggu itu tanpa libur bila hari baru < hari ini.
  delete from staff_time_off
  where kind = 'libur' and not swapped and start_at >= jkt(jkt_today(), '00:00')
    and staff_id is not distinct from p_staff_id and profile_id is not distinct from p_profile_id;
  perform fill_days_off();
end $$;

create table day_off_swaps (
  id uuid primary key default gen_random_uuid(),
  off_id uuid not null references staff_time_off (id) on delete cascade,
  new_date date,                                                       -- pindah hari sendiri
  partner_off_id uuid references staff_time_off (id) on delete cascade, -- tukar dengan libur rekan
  reason text not null default '',
  partner_ok boolean,                                                  -- null = rekan belum menjawab
  status time_off_status not null default 'pending',
  requested_by uuid not null default auth.uid(),
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(new_date, partner_off_id) = 1)
);
alter table day_off_swaps enable row level security;
create policy swaps_read on day_off_swaps for select to authenticated using (
  auth_role() = 'manager' or requested_by = auth.uid()
  or exists (select 1 from staff_time_off o where o.id = partner_off_id and owns_off(o.staff_id, o.profile_id)));
alter publication supabase_realtime add table day_off_swaps;

create function request_day_off_swap(p_off_id uuid, p_new_date date, p_partner_off_id uuid, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare o staff_time_off; p staff_time_off; d0 date; id uuid; who text;
begin
  perform require_role('staff', 'cashier');
  if num_nonnulls(p_new_date, p_partner_off_id) <> 1 then raise exception 'Pilih hari baru atau libur rekan'; end if;
  select * into o from staff_time_off where staff_time_off.id = p_off_id for update;
  if not found or o.kind <> 'libur' or o.status <> 'approved' or not owns_off(o.staff_id, o.profile_id) then
    raise exception 'Libur tidak ditemukan';
  end if;
  d0 := (o.start_at at time zone 'Asia/Jakarta')::date;
  if d0 < jkt_today() then raise exception 'Libur yang sudah lewat tidak bisa ditukar'; end if;
  if exists (select 1 from day_off_swaps s where s.status = 'pending' and p_off_id in (s.off_id, s.partner_off_id)) then
    raise exception 'Libur ini sedang diajukan tukar';
  end if;

  if p_new_date is not null then
    if p_new_date < jkt_today() or p_new_date = d0 then raise exception 'Pilih hari lain yang belum lewat'; end if;
    if date_trunc('week', p_new_date::timestamp) <> date_trunc('week', d0::timestamp) then
      raise exception 'Pindah libur hanya di minggu yang sama (Senin–Minggu)';
    end if;
    perform check_day_off(o.staff_id, o.profile_id, p_new_date, array[o.id]);
  else
    select * into p from staff_time_off where staff_time_off.id = p_partner_off_id for update;
    if not found or p.kind <> 'libur' or p.status <> 'approved' or owns_off(p.staff_id, p.profile_id) then
      raise exception 'Libur rekan tidak ditemukan';
    end if;
    if off_group(p.staff_id, p.profile_id) <> off_group(o.staff_id, o.profile_id) then
      raise exception 'Tukar libur hanya dengan rekan satu bidang';
    end if;
    if (p.start_at at time zone 'Asia/Jakarta')::date < jkt_today()
       or date_trunc('week', p.start_at at time zone 'Asia/Jakarta') <> date_trunc('week', d0::timestamp) then
      raise exception 'Tukar libur hanya dengan libur rekan di minggu yang sama yang belum lewat';
    end if;
    if exists (select 1 from day_off_swaps s where s.status = 'pending' and p_partner_off_id in (s.off_id, s.partner_off_id)) then
      raise exception 'Libur rekan sedang diajukan tukar';
    end if;
  end if;

  insert into day_off_swaps (off_id, new_date, partner_off_id, reason)
  values (p_off_id, p_new_date, p_partner_off_id, coalesce(trim(p_reason), '')) returning day_off_swaps.id into id;
  who := coalesce((select name from staff where staff.id = o.staff_id), (select full_name from profiles where profiles.id = o.profile_id));
  perform safe_alert(format(E'🔁 %s mengajukan tukar libur %s. Setujui di Jadwal → Jadwal libur.', who,
    to_char(d0, 'DD/MM')));
  return id;
end $$;

create function respond_day_off_swap(p_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('staff', 'cashier');
  update day_off_swaps s set partner_ok = p_accept,
    status = case when p_accept then s.status else 'rejected'::time_off_status end
  from staff_time_off p
  where s.id = p_id and s.status = 'pending' and s.partner_ok is null
    and p.id = s.partner_off_id and owns_off(p.staff_id, p.profile_id);
  if not found then raise exception 'Pengajuan tidak ditemukan atau sudah dijawab'; end if;
end $$;

create function cancel_day_off_swap(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('staff', 'cashier');
  update day_off_swaps set status = 'cancelled' where id = p_id and requested_by = auth.uid() and status = 'pending';
  if not found then raise exception 'Pengajuan tidak ditemukan atau sudah diputuskan'; end if;
end $$;

create function decide_day_off_swap(p_id uuid, p_approve boolean) returns void
language plpgsql security definer set search_path = public as $$
declare s day_off_swaps; o staff_time_off; p staff_time_off;
begin
  perform require_role('manager');
  select * into s from day_off_swaps where id = p_id and status = 'pending' for update;
  if not found then raise exception 'Pengajuan tidak ditemukan atau sudah diputuskan'; end if;
  if p_approve then
    select * into o from staff_time_off where id = s.off_id for update;
    if o.status <> 'approved' or o.start_at < jkt(jkt_today(), '00:00') then raise exception 'Libur ini sudah lewat atau dibatalkan'; end if;
    if s.new_date is not null then
      if s.new_date < jkt_today() then raise exception 'Hari baru sudah lewat'; end if;
      perform check_day_off(o.staff_id, o.profile_id, s.new_date, array[o.id]);
      update staff_time_off set start_at = jkt(s.new_date, '00:00'), end_at = jkt(s.new_date + 1, '00:00'), swapped = true
      where id = o.id;
    else
      if s.partner_ok is not true then raise exception 'Rekan belum menyetujui tukar libur ini'; end if;
      select * into p from staff_time_off where id = s.partner_off_id for update;
      if p.status <> 'approved' or p.start_at < jkt(jkt_today(), '00:00') then raise exception 'Libur rekan sudah lewat atau dibatalkan'; end if;
      update staff_time_off set start_at = p.start_at, end_at = p.end_at, swapped = true where id = o.id;
      update staff_time_off set start_at = o.start_at, end_at = o.end_at, swapped = true where id = p.id;
    end if;
  end if;
  update day_off_swaps set status = case when p_approve then 'approved'::time_off_status else 'rejected' end,
    decided_by = auth.uid(), decided_at = now()
  where id = p_id;
end $$;

-- Papan libur untuk manajer, kasir & staf: libur/izin sehari penuh di rentang tanggal (tanpa alasan izin),
-- pengajuan tukar yang boleh dilihat pemanggil, dan daftar orang + hari libur tetap (manajer: semua; lainnya: dirinya).
create function day_off_board(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare mgr boolean;
begin
  perform require_role('manager', 'cashier', 'staff');
  mgr := auth_role() = 'manager';
  return jsonb_build_object(
    'offs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id, 'name', coalesce(st.name, pr.full_name), 'group', off_group(o.staff_id, o.profile_id),
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
        'name', coalesce(st.name, pr.full_name), 'from_date', (o.start_at at time zone 'Asia/Jakarta')::date,
        'new_date', coalesce(s.new_date, (p.start_at at time zone 'Asia/Jakarta')::date),
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
        select jsonb_build_object('staff_id', s.id, 'profile_id', null, 'name', s.name, 'group', s.category, 'day_off', s.day_off) x
        from staff s where s.active and (mgr or s.id = my_staff_id())
        union all
        select jsonb_build_object('staff_id', null, 'profile_id', p.id, 'name', p.full_name, 'group', 'cashier', 'day_off', p.day_off)
        from profiles p where p.active and p.role = 'cashier' and (mgr or p.id = auth.uid())) q), '[]'));
end $$;

do $$
declare f text;
begin
  foreach f in array array['off_group(uuid,uuid)', 'owns_off(uuid,uuid)', 'check_day_off(uuid,uuid,date,uuid[])',
    'set_day_off(uuid,uuid,int)', 'request_day_off_swap(uuid,date,uuid,text)', 'respond_day_off_swap(uuid,boolean)',
    'cancel_day_off_swap(uuid)', 'decide_day_off_swap(uuid,boolean)', 'day_off_board(date,date)'] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;
