begin;
\ir helpers.psql
select plan(9);

-- Ukur campaign: sumber pelanggan baru, sumber pengunjung web, dan laporan campaign (manajer saja).
select tests.su();
select extract(isodow from jkt_today())::int as dow \gset

-- ---------- sumber pengunjung web ----------
select tests.anon();
select track_funnel('uji-sumber-0001', 'landing', 'instagram');
select track_funnel('uji-sumber-0001', 'booked', 'instagram');
select track_funnel('uji-sumber-0002', 'landing', 'BUKAN SUMBER!');
select tests.su();
select is((select source from funnel_events where session_id = 'uji-sumber-0001' and step = 'landing'), 'instagram', 'landing menyimpan sumber');
select is((select source from funnel_events where session_id = 'uji-sumber-0001' and step = 'booked'), null, 'sumber hanya disimpan di landing');
select is((select source from funnel_events where session_id = 'uji-sumber-0002'), null, 'sumber tidak valid diabaikan, kunjungan tetap tercatat');

-- ---------- sumber pelanggan baru ----------
select tests.login(tests.kasir());
select lives_ok($$ insert into customers (name, whatsapp, source) values ('Uji Sumber', '6281299997001', 'instagram') $$, 'kasir mencatat pelanggan baru + sumber');
select throws_like($$ insert into customers (name, source) values ('Uji Salah', 'koran') $$, '%customers_source_check%', 'sumber di luar daftar ditolak');
select tests.su();
select is(book_online(jsonb_build_object('date', jkt_today() + 3, 'time', '11:00', 'service_ids', jsonb_build_array(tests.svc('Potong Rambut')),
  'together', true, 'name', 'Uji Web', 'whatsapp', '081299997002', 'client_request_id', 'uji-sumber-web-01')) ->> 'ok', 'true', 'booking online tamu baru');
select is((select source from customers where whatsapp = '6281299997002'), 'web', 'pelanggan dari booking online bersumber web');

-- ---------- laporan ----------
-- sejak Paket A (31 Okt) pelanggan baru = transaksi pertama di periode → pelanggan instagram bertransaksi hari ini
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method)
select id, 50000, 50000, 50000, 'cash' from customers where whatsapp = '6281299997001';
select tests.login(tests.mgr());
select is((select (x ->> 'n')::int from jsonb_array_elements(campaign_report(jkt_today(), jkt_today()) -> 'new_customers') x where x ->> 'source' = 'instagram') >= 1,
  true, 'laporan menghitung pelanggan baru per sumber');
select tests.login(tests.kasir());
select throws_like($$ select campaign_report(jkt_today(), jkt_today()) $$, '%Akses ditolak%', 'kasir tidak bisa membuka laporan campaign');

select * from finish();
rollback;
