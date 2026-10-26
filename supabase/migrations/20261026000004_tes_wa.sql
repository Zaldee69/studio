-- Tombol "Kirim WA tes" (Pengaturan → Umum): manajer memastikan jalur Wablas di prod jalan tanpa membuat booking palsu.
-- Lewat antrean yang sama dengan konfirmasi booking; dibatasi 3 per 10 menit (kuota Wablas dipakai bersama OTP).
alter table outbound_messages drop constraint outbound_messages_template_check;
alter table outbound_messages add constraint outbound_messages_template_check
  check (template in ('booking_confirmed', 'booking_pending', 'reminder_h1', 'promo', 'otp', 'alert', 'test'));
alter table outbound_messages add constraint outbound_test_shape check (template <> 'test' or (channel = 'whatsapp' and body is not null));

create function send_test_wa(p_phone text) returns void language plpgsql security definer set search_path = public as $$
declare wa text := normalize_wa(p_phone);
begin
  perform require_role('manager');
  if wa is null then raise exception 'Nomor WhatsApp tidak valid'; end if;
  if (select count(*) from outbound_messages where template = 'test' and created_at > now() - interval '10 minutes') >= 3 then
    raise exception 'Sudah 3 tes dalam 10 menit. Tunggu sebentar.';
  end if;
  insert into outbound_messages (channel, to_address, template, body)
  values ('whatsapp', wa, 'test', format(E'Tes WhatsApp %s berhasil.\nKonfirmasi booking dan pengingat ke pelanggan akan dikirim lewat jalur ini.',
    (select shop_name from settings)));
end $$;
revoke execute on function send_test_wa(text) from public, anon;
