-- Pesan WA pelanggan (rapat 26 Okt 2026): teks kode masuk bernada "hangat premium", dan pengingat H-1 hanya untuk
-- booking yang dibuat sebelum hari ini — booking hari ini untuk besok baru saja menerima konfirmasi, tidak perlu diingatkan
-- sejam kemudian.

create or replace function enqueue_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with g as (
    select distinct a.booking_group_id as id from appointments a
    where a.booking_group_id is not null and a.status = 'booked'
      and (a.start_at at time zone 'Asia/Jakarta')::date = jkt_today() + 1
  ), ins as (
    insert into outbound_messages (channel, to_address, template, booking_group_id)
    select v.ch, v.addr, 'reminder_h1', g.id from g join booking_groups b on b.id = g.id join customers c on c.id = b.customer_id,
         lateral (values ('email', c.email), ('whatsapp', c.whatsapp)) v(ch, addr)
    where v.addr is not null and v.addr <> ''
      and (b.created_at at time zone 'Asia/Jakarta')::date < jkt_today()
    on conflict do nothing returning 1
  ) select count(*) into n from ins;
  return n;
end $$;

create or replace function kirim_kode_wa(event jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare wa text := normalize_wa(event -> 'user' ->> 'phone'); shop text;
begin
  if wa is null then
    return jsonb_build_object('error', jsonb_build_object('http_code', 400, 'message', 'Nomor WhatsApp tidak valid'));
  end if;
  select shop_name into shop from settings;
  insert into outbound_messages (channel, to_address, template, body)
  values ('whatsapp', wa, 'otp', format(E'Kode masuk %s: %s\nBerlaku 10 menit. Demi keamanan akun Kakak, jangan berikan kode ini kepada siapa pun, termasuk staf kami.',
                                        shop, event -> 'sms' ->> 'otp'));
  return '{}'::jsonb;
end $$;
