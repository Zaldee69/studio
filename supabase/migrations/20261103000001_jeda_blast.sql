-- Insiden 3 Nov 2026: batas harian dinaikkan ke 170 → 100 pesan promo terkirim dalam 2 semburan (50 dalam ±1 menit,
-- 12.15 & 12.20) → WhatsApp memutus sesi Wablas. Batas harian saja tidak cukup: dispatcher mengirim semua yang jatuh tempo
-- sekaligus. Sekarang promo juga dibatasi per jendela 5 menit (= jadwal cron dispatcher): maksimal 5 pesan; sisanya digeser
-- 5 menit → 50 pesan tersebar ±50 menit. Pesan transaksional (OTP, konfirmasi, pengingat) tidak dibatasi.
create or replace function defer_promo_over_limit() returns int language plpgsql security definer set search_path = public as $$
declare lim int; used int; recent int; room_day int; room_now int; n int; m int;
begin
  select blast_daily_limit into lim from settings;
  select count(*), count(*) filter (where status = 'sending' or sent_at > now() - interval '5 minutes') into used, recent
  from outbound_messages
  where template = 'promo' and (status = 'sending' or (status = 'sent' and (sent_at at time zone 'Asia/Jakarta')::date = jkt_today()));
  room_day := greatest(lim - used, 0);
  room_now := least(room_day, greatest(5 - recent, 0));
  -- lewat batas harian → besok 10.00
  with due as (
    select id from outbound_messages where template = 'promo' and status = 'queued' and send_after <= now()
    order by created_at, id offset room_day
  ) update outbound_messages o set send_after = jkt(jkt_today() + 1, '10:00') from due where o.id = due.id;
  get diagnostics n = row_count;
  -- masih dalam batas harian tapi melebihi jatah 5 menit ini → putaran berikutnya
  with due as (
    select id from outbound_messages where template = 'promo' and status = 'queued' and send_after <= now()
    order by created_at, id offset room_now
  ) update outbound_messages o set send_after = now() + interval '5 minutes' from due where o.id = due.id;
  get diagnostics m = row_count;
  return n + m;
end $$;
