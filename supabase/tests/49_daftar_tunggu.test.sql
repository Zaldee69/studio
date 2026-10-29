begin;
\ir helpers.psql
select plan(8);

select tests.su();
delete from booking_attempts where key like 'tunggu%';
select is(join_waitlist('{"name": "Rina Uji", "whatsapp": "0812 7777 0001", "interests": ["nail"], "source": "ig", "ip": "9.9.9.9"}'),
  '{nail}'::text[], 'daftar baru: minat nail tercatat');
select is((select source from customers where whatsapp = '6281277770001'), 'instagram', 'pelanggan baru dibuat, sumber ?src=ig → instagram');
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '💅 Daftar tunggu Nail Art: Rina Uji (6281277770001) · dari ig'),
  'owner dikabari lewat Telegram');
select is(join_waitlist('{"name": "Rina", "whatsapp": "6281277770001", "interests": ["nail", "lashes"]}'),
  '{lashes}'::text[], 'daftar ulang: hanya minat baru yang ditambahkan, pelanggan tidak dobel');
select is((select count(*) from customers where whatsapp = '6281277770001'), 1::bigint, 'satu pelanggan per nomor');
select throws_ok($$ select join_waitlist('{"name": "X Y", "whatsapp": "123", "interests": ["nail"]}') $$, 'No. WhatsApp tidak valid');

select tests.login(tests.mgr());
select is((select count(*) from campaign_audience('{"waitlist": "lashes"}') where whatsapp = '6281277770001'), 1::bigint,
  'segmen campaign daftar tunggu Lashes');

select tests.su();
select throws_ok($$ select join_waitlist('{"name": "Rina", "whatsapp": "6281277770001", "interests": ["nail"]}'),
                         join_waitlist('{"name": "Rina", "whatsapp": "6281277770001", "interests": ["nail"]}'),
                         join_waitlist('{"name": "Rina", "whatsapp": "6281277770001", "interests": ["nail"]}'),
                         join_waitlist('{"name": "Rina", "whatsapp": "6281277770001", "interests": ["nail"]}') $$,
  'Terlalu banyak percobaan, coba lagi nanti', 'percobaan ke-6 dalam sejam ditolak');

select * from finish();
rollback;
