-- Keamanan login:
--  1. Akun pelanggan baru tersambung ke data pelanggan lama (email sama) HANYA setelah email dikonfirmasi —
--     tanpa ini siapa pun yang tahu email pelanggan bisa mendaftar dan membaca riwayat, no. WA & saldo depositnya.
--  2. Verifikasi 2 langkah (TOTP): akun yang sudah mengaktifkannya wajib sesi aal2 agar RLS mengenali perannya.
--  3. Kode undangan tim bawaan acak (bukan 'GB-2026' yang tercatat di repo).

-- ---------- 1. Tautan akun ↔ data pelanggan ----------
-- p_verified = email terbukti milik pendaftar (tautan konfirmasi diklik). Tanpa bukti, tidak pernah menyambung ke
-- data lama: dibuatkan data pelanggan baru (email dikosongkan bila sudah dipakai data lain).
create function link_customer_account(p_uid uuid, p_email text, p_name text, p_verified boolean) returns uuid
language plpgsql security definer set search_path = public as $$
declare cid uuid;
begin
  if p_verified then
    select c.id into cid from customers c
    where lower(c.email) = lower(p_email) and not exists (select 1 from profiles p where p.customer_id = c.id);
  end if;
  if cid is null then
    insert into customers (name, email, created_by)
    values (p_name, case when exists (select 1 from customers c where lower(c.email) = lower(p_email)) then null else p_email end, null)
    returning id into cid;
  end if;
  update profiles set customer_id = cid where id = p_uid;
  return cid;
end $$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  nm text := coalesce(nullif(trim(m ->> 'full_name'), ''), split_part(new.email, '@', 1));
begin
  if m ->> 'signup' = 'team' then
    if (m ->> 'invite_code') is distinct from (select invite_code from settings) then
      raise exception 'Kode undangan tidak valid';
    end if;
    if (m ->> 'role') not in ('cashier', 'staff') then
      raise exception 'Peran tidak valid';
    end if;
    insert into profiles (id, full_name, email, role, active)
    values (new.id, nm, new.email, (m ->> 'role')::app_role, false);
  else
    insert into profiles (id, full_name, email, role) values (new.id, nm, new.email, 'customer');
    -- Dibuat sudah terkonfirmasi (admin/seed) → tanpa bukti kepemilikan email. Selebihnya menunggu konfirmasi.
    if new.email_confirmed_at is not null then
      perform link_customer_account(new.id, new.email, nm, false);
    end if;
  end if;
  return new;
end $$;

-- Konfirmasi email. Hanya dianggap bukti bila email konfirmasi memang pernah dikirim (confirmation_sent_at);
-- mode autoconfirm (Confirm email dimatikan di dashboard) juga lewat sini tetapi tanpa email → tidak menyambung.
create function on_auth_user_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform link_customer_account(p.id, new.email, p.full_name, old.confirmation_sent_at is not null)
  from profiles p where p.id = new.id and p.role = 'customer' and p.active and p.customer_id is null;
  return new;
end $$;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function on_auth_user_confirmed();

revoke execute on function link_customer_account(uuid, text, text, boolean), on_auth_user_confirmed() from public, anon, authenticated;

-- ---------- 2. Verifikasi 2 langkah ----------
-- Punya faktor TOTP terverifikasi tetapi sesi masih aal1 (baru sandi) → tidak dikenali sebagai peran apa pun.
-- Status faktor disalin ke profiles.mfa_enabled (trigger) karena auth_role() dievaluasi per baris di policy RLS:
-- query ke auth.mfa_factors per baris membuat baca tabel ±10× lebih lambat.
alter table profiles add column mfa_enabled boolean not null default false;

create function sync_mfa_enabled() returns trigger
language plpgsql security definer set search_path = public as $$
declare uid uuid := coalesce(new.user_id, old.user_id);
begin
  update profiles set mfa_enabled = exists (select 1 from auth.mfa_factors f where f.user_id = uid and f.status = 'verified')
  where id = uid;
  return null;
end $$;
create trigger mfa_factors_sync after insert or update of status or delete on auth.mfa_factors
  for each row execute function sync_mfa_enabled();
revoke execute on function sync_mfa_enabled() from public, anon, authenticated;

-- mfa_enabled hanya boleh diubah trigger di atas (bukan pengguna — mematikannya = melewati verifikasi 2 langkah).
create or replace function guard_profile() returns trigger language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and new.mfa_enabled is distinct from old.mfa_enabled then
    raise exception 'Status verifikasi 2 langkah diatur lewat Pengaturan → Keamanan' using errcode = '42501';
  end if;
  if current_user = 'authenticated' and auth_role() is distinct from 'manager'
     and (new.role, new.active, new.staff_id, new.customer_id, new.email)
         is distinct from (old.role, old.active, old.staff_id, old.customer_id, old.email) then
    raise exception 'Hanya manajer yang bisa mengubah peran akun' using errcode = '42501';
  end if;
  return new;
end $$;

create or replace function auth_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and active and (not mfa_enabled or auth.jwt() ->> 'aal' = 'aal2')
$$;
create or replace function my_staff_id() returns uuid
language sql stable security definer set search_path = public as $$
  select staff_id from profiles where id = auth.uid() and active and (not mfa_enabled or auth.jwt() ->> 'aal' = 'aal2')
$$;
create or replace function my_customer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select customer_id from profiles where id = auth.uid() and active and (not mfa_enabled or auth.jwt() ->> 'aal' = 'aal2')
$$;

-- ---------- 3. Kode undangan acak ----------
alter table settings alter column invite_code set default 'GB-' || upper(substr(md5(gen_random_uuid()::text), 1, 10));
update settings set invite_code = 'GB-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)) where invite_code = 'GB-2026';
