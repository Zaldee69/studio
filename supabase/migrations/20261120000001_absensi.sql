-- Absensi (20 Nov): capster, nailist, dan kasir absen dari HP sendiri. Hanya sah bila HP tersambung ke WiFi toko
-- (IP publik terdaftar); dicek di server (server action) lalu memanggil absen_catat() lewat kunci admin, sehingga
-- tidak bisa dipalsukan dari browser. Lupa absen pulang → otomatis pulang jam tutup. Terlambat hanya DICATAT (menit);
-- potongan bayaran bukan bagian fitur ini (keputusan owner, belum ada).
--  • Satu jam masuk/pulang standar (manajer 20 Nov: buka 10.00–21.00), toleransi 10 menit.
--    Lewat toleransi → terlambat = menit sejak jam masuk (bukan sejak batas toleransi).
--  • Kunci orang = profiles.id (kasir tidak punya baris staff).

alter table settings
  add column absen_masuk time not null default '10:00',
  add column absen_pulang time not null default '21:00',
  add column absen_toleransi int not null default 10 check (absen_toleransi between 0 and 60),
  -- Mulai berlaku (manajer 20 Nov: staf dibrief Minggu 22 Nov, aktif Senin 23 Nov). Sebelumnya: tanpa Bolos & tanpa pengingat.
  add column absen_mulai date not null default '2026-11-23',
  add constraint settings_absen_jam check (absen_pulang > absen_masuk);

create table absen_wifi (
  ip text primary key,
  label text not null default '',
  created_at timestamptz not null default now()
);
alter table absen_wifi enable row level security;
create policy manager_all on absen_wifi for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');

create table attendance (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles (id) on delete cascade,
  date date not null,
  in_at timestamptz not null,
  out_at timestamptz,
  auto_out boolean not null default false,
  late_min int not null default 0 check (late_min >= 0),
  manual boolean not null default false,
  note text not null default '',
  created_at timestamptz not null default now(),
  unique (profile_id, date),
  check (out_at is null or out_at >= in_at)
);
alter table attendance enable row level security;
create policy manager_read on attendance for select to authenticated using (auth_role() = 'manager');
create policy own_read on attendance for select to authenticated using (profile_id = auth.uid());
-- Tanpa policy tulis: semua lewat fungsi di bawah.
create trigger audit_attendance after insert or update on attendance for each row when (new.manual) execute function audit_row();
alter publication supabase_realtime add table attendance;

-- Menit terlambat untuk jam masuk tertentu.
create function absen_telat(p_date date, p_in timestamptz) returns int
language sql stable security definer set search_path = public as $$
  select case when m > s.absen_toleransi then m else 0 end
  from settings s, lateral (select greatest(0, floor(extract(epoch from p_in - jkt(p_date, s.absen_masuk)) / 60))::int as m) x
$$;

-- Dipanggil HANYA dari server (kunci admin) setelah IP WiFi toko cocok.
create function absen_catat(p_profile uuid, p_aksi text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare d date := jkt_today(); r attendance; role app_role;
begin
  select p.role into role from profiles p where p.id = p_profile and p.active;
  if role is null or role not in ('staff', 'cashier') then raise exception 'Akun ini tidak perlu absen'; end if;
  select * into r from attendance where profile_id = p_profile and date = d;
  if p_aksi = 'masuk' then
    if found then raise exception 'Kamu sudah absen masuk jam %', fmt_jam(r.in_at); end if;
    insert into attendance (profile_id, date, in_at, late_min) values (p_profile, d, now(), absen_telat(d, now())) returning * into r;
  elsif p_aksi = 'pulang' then
    if not found then raise exception 'Belum absen masuk hari ini'; end if;
    if r.out_at is not null then raise exception 'Kamu sudah absen pulang jam %', fmt_jam(r.out_at); end if;
    update attendance set out_at = now() where id = r.id returning * into r;
  else raise exception 'Aksi tidak dikenal'; end if;
  return jsonb_build_object('in_at', r.in_at, 'out_at', r.out_at, 'late_min', r.late_min);
end $$;
revoke execute on function absen_catat(uuid, text) from public, anon, authenticated;
revoke execute on function absen_telat(date, timestamptz) from public, anon, authenticated;

-- Manajer: isi/koreksi absen (HP mati, WiFi bermasalah, salah jam). Alasan wajib; tercatat di Audit.
create function absen_manual(p_profile uuid, p_date date, p_in time, p_out time, p_note text) returns void
language plpgsql security definer set search_path = public as $$
declare i timestamptz; o timestamptz;
begin
  perform require_role('manager');
  if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'Isi alasan'; end if;
  if p_date > jkt_today() then raise exception 'Tanggal belum tiba'; end if;
  if not exists (select 1 from profiles where id = p_profile and role in ('staff', 'cashier')) then raise exception 'Bukan staf/kasir'; end if;
  if p_in is null then
    delete from attendance where profile_id = p_profile and date = p_date;  -- koreksi: hapus absen salah
    return;
  end if;
  i := jkt(p_date, p_in);
  o := case when p_out is not null then jkt(p_date, p_out) end;
  if o is not null and o < i then raise exception 'Jam pulang harus setelah jam masuk'; end if;
  insert into attendance (profile_id, date, in_at, out_at, late_min, manual, note)
  values (p_profile, p_date, i, o, absen_telat(p_date, i), true, trim(p_note))
  on conflict (profile_id, date) do update
    set in_at = excluded.in_at, out_at = excluded.out_at, auto_out = false, late_min = excluded.late_min, manual = true, note = excluded.note;
end $$;

-- Pulang otomatis jam tutup (lupa absen pulang). Hari lampau yang masih terbuka ikut ditutup.
create function absen_tutup_otomatis() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update attendance a set out_at = greatest(a.in_at, jkt(a.date, s.absen_pulang)), auto_out = true
  from settings s
  where a.out_at is null and now() >= jkt(a.date, s.absen_pulang);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function absen_tutup_otomatis() from public, anon, authenticated;
select cron.schedule('gb-absen-tutup', '5 14 * * *', $$select public.absen_tutup_otomatis()$$);  -- 21.05 WIB

-- Peserta absen: kasir + semua staf layanan yang punya akun.
-- Kehadiran per orang per hari (manajer). status dihitung di aplikasi dari kolom-kolom ini.
create function kehadiran(p_from date, p_to date) returns table (
  profile_id uuid, nama text, kelompok text, tanggal date, in_at timestamptz, out_at timestamptz, auto_out boolean,
  late_min int, manual boolean, note text, libur text, tutup boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  if p_to < p_from or p_to - p_from > 62 then raise exception 'Rentang tanggal tidak valid'; end if;
  return query
  select p.id, coalesce(nullif(p.full_name, ''), s.name),
         case when p.role = 'cashier' then 'kasir' else s.category::text end,
         d::date, a.in_at, a.out_at, coalesce(a.auto_out, false), coalesce(a.late_min, 0), coalesce(a.manual, false), coalesce(a.note, ''),
         (select o.kind from staff_time_off o
           where o.status = 'approved' and o.all_day and (o.profile_id = p.id or o.staff_id = p.staff_id)
             and o.start_at < jkt(d::date + 1, '00:00') and o.end_at > jkt(d::date, '00:00') limit 1),
         d::date < (select absen_mulai from settings)  -- sebelum mulai berlaku diperlakukan seperti hari tutup (tidak dihitung bolos)
           or exists (select 1 from special_closures c where c.date = d::date)
           or exists (select 1 from opening_hours h where h.weekday = extract(dow from d) and h.closed)
  from profiles p
  left join staff s on s.id = p.staff_id
  cross join generate_series(p_from, p_to, interval '1 day') d
  left join attendance a on a.profile_id = p.id and a.date = d::date
  where p.active and (p.role = 'cashier' or (p.role = 'staff' and s.id is not null and s.active))
    and d::date >= p.created_at::date
  order by 3, 2, d;
end $$;

-- Pukul 10.15 WIB: ingatkan manajer siapa yang belum absen (bukan yang libur/izin; tidak pada hari toko tutup).
-- ponytail: jadwal cron tetap 10.15; ubah bila jam masuk standar berubah.
create function alert_belum_absen() returns void language plpgsql security definer set search_path = public as $$
declare d date := jkt_today(); names text;
begin
  if d < (select absen_mulai from settings) or exists (select 1 from special_closures where date = d) or exists (select 1 from opening_hours where weekday = extract(dow from d) and closed) then
    return;
  end if;
  select string_agg(coalesce(nullif(p.full_name, ''), s.name), ', ' order by p.full_name) into names
  from profiles p left join staff s on s.id = p.staff_id
  where p.active and (p.role = 'cashier' or (p.role = 'staff' and s.active))
    and not exists (select 1 from attendance a where a.profile_id = p.id and a.date = d)
    and not exists (select 1 from staff_time_off o where o.status = 'approved' and o.all_day and (o.profile_id = p.id or o.staff_id = p.staff_id)
                    and o.start_at < jkt(d + 1, '00:00') and o.end_at > jkt(d, '00:00'));
  if names is not null then
    perform safe_alert(format(E'🕘 Belum absen sampai %s: %s.\nCek apakah terlambat atau lupa; absen bisa diisi manual di SDM → Kehadiran.', to_char(now() at time zone 'Asia/Jakarta', 'HH24.MI'), names));
  end if;
end $$;
revoke execute on function alert_belum_absen() from public, anon, authenticated;
select cron.schedule('gb-absen-alert', '15 3 * * *', $$select public.alert_belum_absen()$$);  -- 10.15 WIB
