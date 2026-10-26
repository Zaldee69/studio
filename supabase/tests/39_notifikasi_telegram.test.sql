begin;
\ir helpers.psql
select plan(9);

-- Kejadian 22/10: tutup kasir selisih −488.000 tanpa catatan, dan Rabu 21/10 kasir tidak ditutup sama sekali →
-- owner harus tahu lewat Telegram saat itu juga / pagi berikutnya.
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date >= jkt_today() - 1;
alter table cash_closings enable trigger cash_closings_immutable;
update transactions set voided_at = now(), void_reason = 'isolasi tes' where created_at >= jkt(jkt_today(), '00:00') and voided_at is null;
delete from expenses where date >= jkt_today();
delete from special_closures where date = jkt_today() - 1;
update opening_hours set closed = false;
update settings set drawer_start_date = jkt_today() - 1, drawer_start_balance = 500000, alert_cash_diff = 50000;
delete from outbound_messages where template = 'alert';

select is(fmt_rp(-488000), '-Rp488.000', 'format rupiah');
select is(fmt_tgl('2026-10-21'), 'Rab, 21 Okt 2026', 'format tanggal');

select tests.login(tests.mgr());
select (cash_summary(jkt_today()) ->> 'expected_cash')::bigint as exp \gset
select tests.login(tests.kasir());
select save_cash_closing(jkt_today(), :exp - 20000, '', 0);
select tests.su();
select is((select count(*) from outbound_messages where template = 'alert' and body like '📊 Tutup kasir%KURANG Rp20.000%'), 1::bigint,
  'tutup kasir → ringkasan harian; selisih −20.000 (< batas 50.000) tanpa tanda ⚠️');

select tests.login(tests.mgr());
select save_cash_closing(jkt_today(), :exp - 488000, '', 0);
select tests.su();
select is((select count(*) from outbound_messages where template = 'alert' and channel = 'telegram' and status = 'queued' and body like '⚠️ SELISIH%'), 1::bigint,
  'selisih −488.000 → ringkasan bertanda ⚠️ SELISIH masuk antrean Telegram');
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '%(tutup ulang)%⚠️ KURANG Rp488.000%Catatan: (kosong)%'),
  'isi notifikasi: tutup ulang, kurang Rp488.000, catatan kosong');

delete from outbound_messages where template = 'alert';
select alert_missing_closing();
select is((select count(*) from outbound_messages where template = 'alert' and body like '%belum ditutup%'), 1::bigint,
  'kemarin buka & belum tutup kasir → pengingat pagi');
delete from outbound_messages where template = 'alert';
insert into special_closures (date, reason) values (jkt_today() - 1, 'Libur');
select alert_missing_closing();
select is((select count(*) from outbound_messages where template = 'alert'), 0::bigint, 'kemarin tutup khusus → tanpa pengingat');

select tests.login(tests.kasir());
select throws_like($$ select send_test_alert() $$, '%Akses ditolak%', 'kasir tidak bisa mengirim pesan tes');
select tests.login(tests.mgr());
select lives_ok($$ select send_test_alert() $$, 'manajer bisa mengirim pesan tes');

select * from finish();
rollback;
