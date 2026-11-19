-- Pantau sambungan WhatsApp (Wablas): cek tiap 5 menit, kabari owner lewat Telegram saat terputus / kembali, dan saat masa aktif hampir habis.
create table wa_health (
  id boolean primary key default true check (id),
  status text not null default 'unknown' check (status in ('connected', 'down', 'unknown')),
  bad_checks int not null default 0,
  since timestamptz not null default now(),
  checked_at timestamptz,
  last_alert_at timestamptz,
  expired_date date,
  quota int,
  detail text,
  expiry_alert_on date
);
insert into wa_health default values;
alter table wa_health enable row level security;
create policy manager_read on wa_health for select to authenticated using (auth_role() = 'manager');

-- Dipanggil server (service role) setelah tiap pengecekan. Toleransi 2 kali gagal berturut-turut (±10 menit) agar kedipan sesaat tidak mengganggu.
create function wa_health_record(p_ok boolean, p_connected boolean, p_expired date default null, p_quota int default null, p_detail text default null) returns void
language plpgsql security definer set search_path = public as $$
declare h wa_health; bad int; lama int;
begin
  select * into h from wa_health for update;
  if not p_ok then
    bad := h.bad_checks + 1;
    update wa_health set bad_checks = bad, checked_at = now(), detail = p_detail where id;
    if bad >= 3 and (h.last_alert_at is null or h.last_alert_at < now() - interval '6 hours') then
      perform enqueue_alert(format(E'⚠️ Status WhatsApp tidak bisa diperiksa (%s kali berturut-turut).\n%s\nCek token Wablas di server, atau apakah layanan Wablas sedang gangguan.', bad, coalesce(p_detail, '')));
      update wa_health set last_alert_at = now() where id;
    end if;
    return;
  end if;

  if p_connected then
    if h.status = 'down' then
      lama := greatest(1, round(extract(epoch from now() - h.since) / 60))::int;
      perform enqueue_alert(format(E'✅ WhatsApp tersambung kembali (terputus ±%s menit).\nPesan yang tertunda akan dikirim ulang oleh antrean.', lama));
    end if;
    update wa_health set status = 'connected', bad_checks = 0, since = case when status = 'connected' then since else now() end,
      checked_at = now(), expired_date = p_expired, quota = p_quota, detail = p_detail, last_alert_at = case when status = 'down' then null else last_alert_at end where id;
  else
    bad := h.bad_checks + 1;
    if bad >= 2 then
      if h.status <> 'down' or h.last_alert_at is null or h.last_alert_at < now() - interval '6 hours' then
        perform enqueue_alert(format(E'🔴 WhatsApp (Wablas) TERPUTUS.\n%s\nSelama terputus: pengingat H-1, konfirmasi booking, struk, dan permintaan ulasan tidak terkirim (antrean tetap mencoba ulang).\nBuka dashboard Wablas lalu scan QR ulang.', coalesce(p_detail, '')));
        h.last_alert_at := now();
      end if;
      update wa_health set status = 'down', bad_checks = bad, since = case when status = 'down' then since else now() end,
        checked_at = now(), expired_date = p_expired, quota = p_quota, detail = p_detail, last_alert_at = h.last_alert_at where id;
    else
      update wa_health set bad_checks = bad, checked_at = now(), expired_date = p_expired, quota = p_quota, detail = p_detail where id;
    end if;
  end if;

  -- masa aktif perangkat: kabari sekali sehari mulai 7 hari sebelum habis
  if p_expired is not null and p_expired <= jkt_today() + 7 and (h.expiry_alert_on is null or h.expiry_alert_on < jkt_today()) then
    perform enqueue_alert(format(E'🔔 Masa aktif Wablas %s (%s). Perpanjang supaya WhatsApp tidak berhenti.',
      case when p_expired < jkt_today() then 'sudah habis' else 'hampir habis' end, to_char(p_expired, 'DD Mon YYYY')));
    update wa_health set expiry_alert_on = jkt_today() where id;
  end if;
end $$;
revoke all on function wa_health_record(boolean, boolean, date, int, text) from public, anon, authenticated;

create function kick_wa_health() returns void language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  select value into url from app_config where key = 'notify_url';
  if url is null then return; end if;
  select value into secret from app_config where key = 'push_secret';
  perform net.http_post(url := replace(url, '/dispatch', '/wa-health'), body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')));
end $$;
select cron.schedule('gb-wa-health', '*/5 * * * *', $$select public.kick_wa_health()$$);
