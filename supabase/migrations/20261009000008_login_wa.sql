-- Akun pelanggan: masuk dengan nomor WhatsApp + kode (Supabase Auth phone OTP). Tanpa email & kata sandi.
-- Kode dikirim HANYA lewat WhatsApp (Wablas): hook pengirim kode Supabase Auth (namanya "Send SMS" di Supabase, tetapi
-- tidak ada SMS) → antrean outbound_messages → Wablas.
-- Nomor terbukti milik pelanggan (kode benar) → akun langsung memakai data pelanggan dengan nomor itu
-- (riwayat booking tamu, transaksi, saldo deposit ikut). Login tim (email + sandi) tidak berubah.

-- ---------- Kode OTP lewat antrean pesan ----------
alter table outbound_messages drop constraint outbound_messages_template_check;
alter table outbound_messages add constraint outbound_messages_template_check
  check (template in ('booking_confirmed', 'booking_pending', 'reminder_h1', 'promo', 'otp'));
alter table outbound_messages add constraint outbound_otp_shape check (template <> 'otp' or body is not null or status <> 'queued');

-- Kode rahasia: tidak boleh terbaca manajer (halaman "Pesan keluar") dan dihapus setelah selesai diproses.
drop policy manager_read on outbound_messages;
create policy manager_read on outbound_messages for select to authenticated using (auth_role() = 'manager' and template <> 'otp');
create function scrub_otp_body() returns trigger language plpgsql as $$
begin
  if new.template = 'otp' and new.status in ('sent', 'failed', 'skipped') then new.body := null; end if;
  return new;
end $$;
create trigger outbound_scrub_otp before update on outbound_messages for each row execute function scrub_otp_body();

-- Hook Supabase Auth (auth.hook.send_sms): event = {"user": {"phone": "62…"}, "sms": {"otp": "123456"}}.
create function kirim_kode_wa(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wa text := normalize_wa(event -> 'user' ->> 'phone'); shop text;
begin
  if wa is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Nomor WhatsApp tidak valid'));
  end if;
  select shop_name into shop from settings;
  insert into outbound_messages (channel, to_address, template, body)
  values ('whatsapp', wa, 'otp', format('Kode masuk %s: %s. Berlaku 10 menit. Jangan bagikan kode ini kepada siapa pun, termasuk staf %s.',
                                        shop, event -> 'sms' ->> 'otp', shop));
  return '{}'::jsonb;
end $$;
grant execute on function kirim_kode_wa(jsonb) to supabase_auth_admin;
revoke execute on function kirim_kode_wa(jsonb) from public, anon, authenticated;

-- ---------- Tautan akun ↔ data pelanggan lewat nomor WA terverifikasi ----------
create function link_customer_by_phone(p_uid uuid, p_phone text) returns uuid
language plpgsql security definer set search_path = public as $$
declare wa text := normalize_wa(p_phone); prof profiles; cid uuid; cname text;
begin
  select * into prof from profiles where id = p_uid and role = 'customer' and active for update;
  if not found or prof.customer_id is not null or wa is null then return prof.customer_id; end if;
  select c.id, c.name into cid, cname from customers c
  where c.whatsapp = wa and not exists (select 1 from profiles p where p.customer_id = c.id) for update;
  if cid is null then
    insert into customers (name, whatsapp) values (prof.full_name,
      case when exists (select 1 from customers where whatsapp = wa) then null else wa end) returning id into cid;
  end if;
  -- pelanggan tamu sudah tercatat namanya oleh kasir/booking → pakai sebagai nama akun bila akun belum bernama
  update profiles set customer_id = cid,
         full_name = case when full_name in ('', wa) and cname is not null then cname else full_name end
  where id = p_uid;
  return cid;
end $$;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  m jsonb := coalesce(new.raw_user_meta_data, '{}');
  nm text := coalesce(nullif(trim(m ->> 'full_name'), ''), split_part(new.email, '@', 1), new.phone, '');
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
    if new.phone is not null and new.phone_confirmed_at is not null then
      perform link_customer_by_phone(new.id, new.phone);           -- dibuat sudah terverifikasi (admin/seed)
    elsif new.email is not null and new.email_confirmed_at is not null then
      perform link_customer_account(new.id, new.email, nm, false);  -- akun email lama (admin/seed)
    end if;
  end if;
  return new;
end $$;

-- Kode WA benar → phone_confirmed_at terisi → sambungkan.
create function on_auth_phone_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform link_customer_by_phone(new.id, new.phone);
  return new;
end $$;
create trigger on_auth_phone_confirmed after update of phone_confirmed_at on auth.users
  for each row when (old.phone_confirmed_at is null and new.phone_confirmed_at is not null)
  execute function on_auth_phone_confirmed();

revoke execute on function link_customer_by_phone(uuid, text), on_auth_phone_confirmed() from public, anon, authenticated;
