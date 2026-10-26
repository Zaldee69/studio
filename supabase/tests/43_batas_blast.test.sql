begin;
\ir helpers.psql
select plan(5);

-- Batas blast per hari: kelebihan pindah ke besok 10.00 WIB; batas dibaca saat kirim; transaksional tidak tersentuh.
select tests.su();
update settings set blast_daily_limit = 3;
insert into campaigns (id, name, message, segment) values ('00000000-0000-0000-00b1-000000000001', 'Uji batas', 'Hai {nama}', '{}');
insert into campaign_sends (id, campaign_id, message, segment) values ('00000000-0000-0000-00b1-000000000002', '00000000-0000-0000-00b1-000000000001', 'Hai', '{}');
insert into outbound_messages (channel, to_address, template, send_id, body, status, sent_at)
  values ('whatsapp', '6281290000100', 'promo', '00000000-0000-0000-00b1-000000000002', 'Hai', 'sent', now());
insert into outbound_messages (channel, to_address, template, send_id, body, created_at)
  select 'whatsapp', '62812900001' || lpad(i::text, 2, '0'), 'promo', '00000000-0000-0000-00b1-000000000002', 'Hai', now() + i * interval '1 second'
  from generate_series(1, 5) i;
insert into outbound_messages (channel, to_address, template, body) values ('whatsapp', '6281290000200', 'otp', 'Kode');

select is(defer_promo_over_limit(), 3, '1 terkirim hari ini + batas 3 → 2 dikirim, 3 dipindah');
select is((select count(*) from outbound_messages where template = 'promo' and status = 'queued' and send_after = jkt(jkt_today() + 1, '10:00')),
  3::bigint, 'kelebihan dijadwalkan besok 10.00 WIB');
select is((select send_after <= now() from outbound_messages where template = 'otp' and to_address = '6281290000200'), true, 'kode masuk tidak ditunda');
select is(defer_promo_over_limit(), 0, 'dipanggil ulang → tidak ada yang dipindah lagi');
update settings set blast_daily_limit = 10;
update outbound_messages set send_after = now() where template = 'promo' and status = 'queued';
select is(defer_promo_over_limit(), 0, 'batas dinaikkan → semua boleh dikirim hari ini');

select * from finish();
rollback;
