-- Batas blast promosi per hari (rapat campaign 26 Okt: 202 kontak dikirim bertahap 50 → 70 → 82).
-- Dicek saat pengiriman, bukan saat campaign dibuat: manajer bisa mengubah angkanya tiap hari dan antrean ikut.
-- Kelebihan hari ini pindah ke besok 10.00 WIB; pesan transaksional (OTP, konfirmasi, pengingat) tidak dibatasi.
alter table settings add column blast_daily_limit int not null default 50 check (blast_daily_limit between 1 and 1000);

-- Dipanggil /api/notifications/dispatch sebelum mengambil antrean.
-- ponytail: dua dispatcher paralel bisa melewati batas beberapa pesan; kunci advisory bila perlu persis.
create function defer_promo_over_limit() returns int language plpgsql security definer set search_path = public as $$
declare lim int; used int; n int;
begin
  select blast_daily_limit into lim from settings;
  select count(*) into used from outbound_messages
  where template = 'promo' and (status = 'sending' or (status = 'sent' and (sent_at at time zone 'Asia/Jakarta')::date = jkt_today()));
  with due as (
    select id from outbound_messages where template = 'promo' and status = 'queued' and send_after <= now()
    order by created_at, id offset greatest(lim - used, 0)
  ) update outbound_messages o set send_after = jkt(jkt_today() + 1, '10:00') from due where o.id = due.id;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function defer_promo_over_limit() from public, anon, authenticated;
