-- Notifikasi Telegram untuk kejadian kritis (owner/manajer), lewat antrean outbound_messages yang sudah ada:
--   • channel 'telegram', template 'alert', body = teks siap kirim, to_address = 'ops'. Penerima (TELEGRAM_CHAT_ID) &
--     token bot (TELEGRAM_BOT_TOKEN) ada di environment server, tidak disimpan di DB;
--   • tutup kasir (termasuk tutup ulang) dengan |selisih| ≥ settings.alert_cash_diff → langsung dikirim;
--   • tiap 08.00 WIB: kemarin studio buka tapi kasir belum ditutup → dikirim;
--   • gagal antre tidak pernah menggagalkan tutup kasir.
alter table settings add column alert_cash_diff bigint not null default 50000 check (alert_cash_diff > 0);

alter table outbound_messages drop constraint outbound_messages_channel_check;
alter table outbound_messages add constraint outbound_messages_channel_check check (channel in ('email', 'whatsapp', 'telegram'));
alter table outbound_messages drop constraint outbound_messages_template_check;
alter table outbound_messages add constraint outbound_messages_template_check
  check (template in ('booking_confirmed', 'booking_pending', 'reminder_h1', 'promo', 'otp', 'alert'));
alter table outbound_messages add constraint outbound_alert_shape check (template <> 'alert' or (channel = 'telegram' and body is not null));

-- Format pesan: Rp1.234.567 dan "Rab, 21 Okt 2026".
create function fmt_rp(n bigint) returns text language sql immutable as $$
  select case when n < 0 then '-' else '' end || 'Rp' || replace(to_char(abs(n), 'FM999,999,999,990'), ',', '.')
$$;
create function fmt_tgl(d date) returns text language sql immutable as $$
  select (array['Min','Sen','Sel','Rab','Kam','Jum','Sab'])[extract(dow from d)::int + 1] || ', ' || extract(day from d)::int || ' '
         || (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from d)::int] || ' ' || extract(year from d)::int
$$;

create function enqueue_alert(p_body text) returns void language sql security definer set search_path = public as $$
  insert into outbound_messages (channel, to_address, template, body) values ('telegram', 'ops', 'alert', p_body)
$$;
revoke execute on function enqueue_alert(text) from public, anon, authenticated;

create function alert_cash_closing() returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; who text; again boolean;
begin
  select alert_cash_diff into lim from settings;
  if abs(new.difference) < coalesce(lim, 50000) then return null; end if;
  select nullif(full_name, '') into who from profiles where id = new.cashier_id;
  again := exists (select 1 from cash_closings c where c.date = new.date and c.id <> new.id);
  begin
    perform enqueue_alert(format(E'⚠️ Selisih tutup kasir %s%s\n%s %s\nSeharusnya %s, dihitung %s\nDitutup oleh: %s\nCatatan: %s',
      fmt_tgl(new.date), case when again then ' (tutup ulang)' else '' end,
      case when new.difference < 0 then 'KURANG' else 'LEBIH' end, fmt_rp(abs(new.difference)),
      fmt_rp(new.expected_cash), fmt_rp(new.physical_cash), coalesce(who, '-'), coalesce(nullif(trim(new.note), ''), '(kosong)')));
  exception when others then
    raise warning 'alert_cash_closing gagal antre: %', sqlerrm;  -- notifikasi gagal ≠ tutup kasir gagal
  end;
  return null;
end $$;
create trigger cash_closings_alert after insert on cash_closings for each row execute function alert_cash_closing();

-- Kemarin buka (jam buka mingguan & tanggal tutup khusus) tapi belum ada tutup kasir → ingatkan.
create function alert_missing_closing() returns void language plpgsql security definer set search_path = public as $$
declare d date := jkt_today() - 1;
begin
  if exists (select 1 from cash_closings where date = d)
     or exists (select 1 from special_closures where date = d)
     or exists (select 1 from opening_hours where weekday = extract(dow from d) and closed)
     or d < coalesce((select drawer_start_date from settings), d) then
    return;
  end if;
  perform enqueue_alert(format(E'🔔 Kasir %s belum ditutup.\nTutup kasir kemarin hari ini juga (kasir masih bisa, atau manajer), supaya uang laci tidak tercampur dengan hari ini.', fmt_tgl(d)));
end $$;
revoke execute on function alert_missing_closing() from public, anon, authenticated;
select cron.schedule('gb-alert-missing-closing', '0 1 * * *', $$select public.alert_missing_closing()$$);  -- 08.00 WIB

-- Tombol "Kirim pesan tes" di Pengaturan (manajer).
create function send_test_alert() returns void language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager');
  perform enqueue_alert(format(E'✅ Tes notifikasi %s berhasil.\nPesan penting (selisih tutup kasir, kasir belum ditutup) akan dikirim ke chat ini.',
    (select shop_name from settings)));
end $$;
revoke execute on function send_test_alert() from public, anon;
