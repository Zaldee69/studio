-- Pengetatan pendaftaran akun tim (audit 15/10/2026):
--   1. Kode undangan diganti otomatis setiap kali manajer mengaktifkan akun tim baru → kode yang terlanjur tersebar
--      tidak bisa dipakai mendaftar lagi.
--   2. Akun tim hanya bisa diaktifkan bila emailnya sudah terverifikasi; daftar persetujuan menampilkan waktu daftar
--      & status verifikasi (team_signups()).
--   3. Manajer wajib verifikasi 2 langkah (settings.manager_mfa_required; ditegakkan di proxy).
alter table settings add column manager_mfa_required boolean not null default true;

create function team_signups()
returns table (id uuid, full_name text, email text, role app_role, signed_up_at timestamptz, email_confirmed_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.full_name, p.email, p.role, u.created_at, u.email_confirmed_at
  from profiles p join auth.users u on u.id = p.id
  where p.role in ('cashier', 'staff', 'manager') and not p.active and auth_role() = 'manager'
  order by u.created_at desc
$$;
revoke execute on function team_signups() from public, anon;

create function team_activation_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- hanya aksi lewat aplikasi (sesi pengguna); operasi admin/seed (service role, postgres) tidak terkena
  if auth.uid() is not null and new.active and not old.active and new.role <> 'customer' then
    if not exists (select 1 from auth.users u where u.id = new.id and u.email_confirmed_at is not null) then
      raise exception 'Email akun ini belum diverifikasi — minta pendaftar membuka tautan di emailnya dulu';
    end if;
    update settings set invite_code = 'GB-' || upper(substr(md5(gen_random_uuid()::text), 1, 10)) where id;
  end if;
  return new;
end $$;
create trigger team_activation before update of active on profiles for each row execute function team_activation_guard();
