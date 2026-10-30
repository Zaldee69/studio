-- Formulir lamaran kerja publik (/karir): capster & kasir. Jawaban per posisi disimpan apa adanya (answers jsonb);
-- manajer membaca & memberi status di Pengaturan → Tim → Pelamar. Owner dikabari lewat Telegram.

create table job_applications (
  id uuid primary key default gen_random_uuid(),
  position text not null check (position in ('capster', 'kasir')),
  name text not null check (length(name) between 2 and 60),
  whatsapp text not null check (whatsapp ~ '^62[0-9]{8,13}$'),
  answers jsonb not null default '{}',
  status text not null default 'baru' check (status in ('baru', 'dihubungi', 'tes', 'diterima', 'ditolak')),
  note text not null default '',
  created_at timestamptz not null default now()
);
alter table job_applications enable row level security;
create policy manager_all on job_applications for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');

-- Dipanggil server action (service role) — p: {position, name, whatsapp, answers, ip}. Rate limit seperti booking online.
create function apply_job(p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  wa text := normalize_wa(p ->> 'whatsapp');
  nm text := left(trim(coalesce(p ->> 'name', '')), 60);
  pos text := p ->> 'position';
  ip text := coalesce(p ->> 'ip', '');
  ans jsonb := coalesce(p -> 'answers', '{}');
  id uuid;
begin
  if pos not in ('capster', 'kasir') then raise exception 'Pilih posisi'; end if;
  if length(nm) < 2 then raise exception 'Nama wajib diisi'; end if;
  if wa is null then raise exception 'No. WhatsApp tidak valid'; end if;
  if jsonb_typeof(ans) <> 'object' or length(ans::text) > 8000 then raise exception 'Jawaban terlalu panjang'; end if;
  if (select count(*) from booking_attempts where key = 'lamar:' || wa and created_at > now() - interval '1 hour') >= 3
     or (ip <> '' and (select count(*) from booking_attempts where key = 'lamar-ip:' || ip and created_at > now() - interval '1 hour') >= 10) then
    raise exception 'Terlalu banyak percobaan, coba lagi nanti';
  end if;
  insert into booking_attempts (key) values ('lamar:' || wa);
  if ip <> '' then insert into booking_attempts (key) values ('lamar-ip:' || ip); end if;

  insert into job_applications (position, name, whatsapp, answers) values (pos, nm, wa, ans) returning job_applications.id into id;
  perform enqueue_alert(format(E'📝 Lamaran %s: %s (%s)%s%s', case pos when 'capster' then 'capster' else 'kasir' end, nm, wa,
    coalesce(' · pengalaman ' || nullif(ans ->> 'pengalaman_tahun', '') || ' th', ''),
    coalesce(' · minta ' || nullif(ans ->> 'ekspektasi_gaji', ''), '')));
  return id;
end $$;
revoke execute on function apply_job(jsonb) from public, anon, authenticated;
