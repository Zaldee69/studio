-- Verifikasi nomor WhatsApp akun pelanggan dengan kode OTP (dikirim lewat penyedia WhatsApp API).
-- Nomor baru tersimpan di akun SETELAH terbukti milik pendaftar. Bila nomor itu pernah dipakai booking sebagai tamu,
-- akun diarahkan ke data pelanggan tamu tersebut (riwayat, saldo deposit, transaksi ikut) — tanpa bukti, siapa pun yang
-- tahu nomor WA orang lain bisa membaca riwayat & memakai saldonya.
-- Data keuangan (transaksi, top-up, booking lunas) dikunci trigger → tidak pernah dipindah: bila akun DAN data tamu
-- sama-sama punya riwayat, penggabungan ditolak (needs_merge) dan ditangani studio.

create table wa_verifications (
  id bigint generated always as identity primary key,
  profile_id uuid not null references profiles (id) on delete cascade,
  whatsapp text not null,
  code_hash text not null,
  attempts int not null default 0,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index wa_verifications_profile_idx on wa_verifications (profile_id, created_at);
create index wa_verifications_wa_idx on wa_verifications (whatsapp, created_at);
alter table wa_verifications enable row level security; -- tanpa policy: hanya server (service role)

create function customer_has_activity(p_cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from appointments where customer_id = p_cid)
      or exists (select 1 from transactions where customer_id = p_cid)
      or exists (select 1 from deposit_topups where customer_id = p_cid)
      or exists (select 1 from booking_groups where customer_id = p_cid)
      or exists (select 1 from hair_consults where customer_id = p_cid)
$$;

-- Kode dibuat & dikirim server; di sini hanya hash-nya. Batas: 3 kode/jam per akun dan per nomor, berlaku 10 menit.
create function wa_otp_request(p_uid uuid, p_wa text, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare prof profiles; wa text := normalize_wa(p_wa);
begin
  select * into prof from profiles where id = p_uid and active and role = 'customer';
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Akun tidak valid'); end if;
  if wa is null then return jsonb_build_object('ok', false, 'code', 'invalid_wa', 'message', 'No. WhatsApp tidak valid'); end if;
  if p_code !~ '^\d{6}$' then raise exception 'Kode tidak valid'; end if;
  if exists (select 1 from customers c join profiles p on p.customer_id = c.id where c.whatsapp = wa and p.id <> p_uid) then
    return jsonb_build_object('ok', false, 'code', 'taken', 'message', 'Nomor ini sudah dipakai akun lain. Masuk dengan akun tersebut atau hubungi studio.');
  end if;
  if (select whatsapp from customers where id = prof.customer_id) = wa then
    return jsonb_build_object('ok', false, 'code', 'already', 'message', 'Nomor ini sudah terverifikasi di akun Anda.');
  end if;
  if (select count(*) from wa_verifications where profile_id = p_uid and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from wa_verifications where whatsapp = wa and created_at > now() - interval '1 hour') >= 3 then
    return jsonb_build_object('ok', false, 'code', 'rate', 'message', 'Terlalu banyak permintaan kode. Coba lagi dalam 1 jam.');
  end if;
  insert into wa_verifications (profile_id, whatsapp, code_hash, expires_at)
  values (p_uid, wa, encode(extensions.digest(p_code, 'sha256'), 'hex'), now() + interval '10 minutes');
  return jsonb_build_object('ok', true, 'whatsapp', wa);
end $$;

create function wa_otp_verify(p_uid uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v wa_verifications; prof profiles; mine uuid; other customers; mail text; merged boolean := false;
begin
  select * into prof from profiles where id = p_uid and active and role = 'customer' for update;
  if not found then return jsonb_build_object('ok', false, 'code', 'invalid', 'message', 'Akun tidak valid'); end if;
  select * into v from wa_verifications where profile_id = p_uid and used_at is null order by created_at desc limit 1 for update;
  if not found or v.expires_at < now() then
    return jsonb_build_object('ok', false, 'code', 'expired', 'message', 'Kode kedaluwarsa. Minta kode baru.');
  end if;
  if v.attempts >= 5 then return jsonb_build_object('ok', false, 'code', 'locked', 'message', 'Terlalu banyak kode salah. Minta kode baru.'); end if;
  if v.code_hash <> encode(extensions.digest(coalesce(p_code, ''), 'sha256'), 'hex') then
    update wa_verifications set attempts = attempts + 1 where id = v.id;
    return jsonb_build_object('ok', false, 'code', 'wrong', 'message', 'Kode salah.');
  end if;
  update wa_verifications set used_at = now() where id = v.id;

  mine := prof.customer_id;
  select * into other from customers where whatsapp = v.whatsapp for update;
  if other.id is null then
    if mine is null then
      insert into customers (name, whatsapp) values (prof.full_name, v.whatsapp) returning id into mine;
      update profiles set customer_id = mine where id = p_uid;
    else
      update customers set whatsapp = v.whatsapp where id = mine;
    end if;
  elsif other.id is distinct from mine then
    if exists (select 1 from profiles where customer_id = other.id and id <> p_uid) then
      return jsonb_build_object('ok', false, 'code', 'taken', 'message', 'Nomor ini sudah dipakai akun lain.');
    end if;
    if mine is not null and customer_has_activity(mine) then
      return jsonb_build_object('ok', false, 'code', 'needs_merge',
        'message', 'Nomor ini punya riwayat booking terpisah dari akun Anda. Hubungi studio untuk menggabungkan datanya.');
    end if;
    -- akun baru tanpa riwayat → pakai data pelanggan tamu (riwayat & saldo ikut), lengkapi email-nya
    update profiles set customer_id = other.id where id = p_uid;
    if mine is not null then
      delete from customers where id = mine returning email into mail;  -- kosong (tanpa riwayat), email unik dipindah
      if other.email is null and mail is not null then update customers set email = mail where id = other.id; end if;
    end if;
    merged := customer_has_activity(other.id);
  end if;
  return jsonb_build_object('ok', true, 'whatsapp', v.whatsapp, 'merged', merged);
end $$;

revoke execute on function customer_has_activity(uuid), wa_otp_request(uuid, text, text), wa_otp_verify(uuid, text)
  from public, anon, authenticated;
grant execute on function wa_otp_request(uuid, text, text), wa_otp_verify(uuid, text) to service_role;
