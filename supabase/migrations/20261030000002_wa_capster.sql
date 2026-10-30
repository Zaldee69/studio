-- WA ke capster/terapis (template staff_report = teks jadi untuk staf), tanpa perlu akun aplikasi:
--   • staff.whatsapp: nomor staf (diisi di Pengaturan → Tim → Staf); cadangan: No. WA di akun yang tertaut
--   • booking baru (bukan walk-in, mulai > 30 menit lagi), dipindah, dibatalkan → WA ke staf yang dipilih
--   • rekap jadwal hari ini tiap pagi 08.30 WIB
--   • rapor mingguan (Senin) kini memakai nomor yang sama
-- Isi pesan hanya nama pelanggan, waktu, layanan, kursi — tanpa nomor HP pelanggan.

alter table staff add column whatsapp text check (whatsapp ~ '^62[0-9]{8,13}$');

create function staff_normalize_wa() returns trigger language plpgsql as $$
begin
  if nullif(trim(coalesce(new.whatsapp, '')), '') is null then new.whatsapp := null; return new; end if;
  new.whatsapp := normalize_wa(new.whatsapp);
  if new.whatsapp is null then raise exception 'No. WA staf tidak valid (contoh 0812…)'; end if;
  return new;
end $$;
create trigger staff_normalize_wa before insert or update of whatsapp on staff for each row execute function staff_normalize_wa();

create function staff_wa(p_staff uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(s.whatsapp, (select normalize_wa(p.phone) from profiles p where p.staff_id = s.id and p.active and normalize_wa(p.phone) is not null limit 1))
  from staff s where s.id = p_staff and s.active
$$;

-- Satu baris jadwal: "Sen, 2 Nov 14.00 · Dion · Fresh Groom · Kursi Barber 1"
create function appt_line(p_id uuid, p_with_date boolean default true) returns text language sql stable security definer set search_path = public as $$
  select concat_ws(' · ',
    concat(case when p_with_date then fmt_tgl((a.start_at at time zone 'Asia/Jakarta')::date) || ' ' end,
           to_char(a.start_at at time zone 'Asia/Jakarta', 'HH24.MI')),
    coalesce(c.name, a.guest_name, 'Pelanggan'),
    nullif((select string_agg(s.name, ', ') from appointment_services x join services s on s.id = x.service_id where x.appointment_id = a.id), ''),
    r.name)
  from appointments a left join customers c on c.id = a.customer_id left join resources r on r.id = a.resource_id where a.id = p_id
$$;

-- Dijalankan saat transaksi commit (layanan booking sudah tercatat). Membaca baris terbaru, bukan nilai saat event.
create function notify_staff_wa() returns trigger language plpgsql security definer set search_path = public as $$
declare a appointments; kind text; wa text;
begin
  select * into a from appointments where id = new.id;
  if a.staff_id is null or a.source = 'walk_in' then return null; end if;
  kind := case
    when tg_op = 'INSERT' then case when a.status = 'booked' and a.start_at > now() + interval '30 minutes' then 'new' end
    when a.created_at = now() then null  -- diubah dalam transaksi yang sama dengan pembuatannya: sudah dikabari sebagai baru
    when new.status = 'cancelled' and old.status <> 'cancelled' and old.start_at > now() then 'cancelled'
    when old.status = 'pending_review' and new.status = 'booked' and a.start_at > now() then 'new'
    when new.staff_id is distinct from old.staff_id and a.status = 'booked' and a.start_at > now() then 'new'
    when (new.start_at, new.resource_id) is distinct from (old.start_at, old.resource_id) and a.status = 'booked' and old.start_at > now() then 'changed'
  end;
  wa := staff_wa(a.staff_id);
  if kind is null or wa is null then return null; end if;
  insert into outbound_messages (channel, to_address, template, body)
  values ('whatsapp', wa, 'staff_report', case kind
    when 'new' then E'📅 Booking baru\n'
    when 'changed' then E'🔁 Booking dipindah\n'
    else E'❌ Booking dibatalkan\n' end || appt_line(a.id));
  return null;
end $$;
create constraint trigger appointments_notify_wa after insert or update on appointments
  deferrable initially deferred for each row execute function notify_staff_wa();

-- Rekap pagi: satu WA per staf yang punya jadwal hari ini.
create function staff_daily_schedule() returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with t as (select a.staff_id, a.id, a.start_at from appointments a
             where (a.start_at at time zone 'Asia/Jakarta')::date = jkt_today()
               and a.status in ('booked', 'pending_review', 'arrived') and a.staff_id is not null),
  ins as (
    insert into outbound_messages (channel, to_address, template, body)
    select 'whatsapp', staff_wa(t.staff_id), 'staff_report',
           format(E'📋 Jadwal %s · %s\n%s', st.name, fmt_tgl(jkt_today()), string_agg(appt_line(t.id, false), E'\n' order by t.start_at))
    from t join staff st on st.id = t.staff_id
    where staff_wa(t.staff_id) is not null
    group by t.staff_id, st.name
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;
select cron.schedule('gb-jadwal-capster', '30 1 * * *', $$select public.staff_daily_schedule()$$);  -- 08.30 WIB

-- Rapor mingguan: nomor dari staff_wa() (kolom staf, cadangan akun) — capster tanpa akun tetap menerima.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('staff_weekly_report'::regproc) into def;
  old := def;
  def := replace(def, $a$select 'whatsapp', normalize_wa(p.phone), 'staff_report'$a$, $a$select 'whatsapp', staff_wa(st.id), 'staff_report'$a$);
  def := replace(def, $a$ join profiles p on p.staff_id = st.id and p.active$a$, '');
  def := replace(def, $a$and normalize_wa(p.phone) is not null$a$, $a$and staff_wa(st.id) is not null$a$);
  if def = old or def ~ 'p\.phone' then raise exception 'Patch staff_weekly_report tidak menemukan teks'; end if;
  execute def;
end $$;

revoke execute on function staff_wa(uuid), appt_line(uuid, boolean), notify_staff_wa(), staff_daily_schedule() from public, anon, authenticated;
