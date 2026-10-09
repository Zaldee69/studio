begin;
\ir helpers.psql
select plan(14);

-- CRM blast promosi: segmen pelanggan → satu pesan WA per pelanggan di antrean outbound_messages.
select tests.su();
update campaign_sends set created_at = created_at - interval '1 hour'; -- kiriman lain (mis. E2E) tidak ikut batas 3/10 menit
insert into customers (id, name, whatsapp) values
  ('00000000-0000-0000-00dd-000000000001', 'Dodi Lama Pergi', '6281300000001'),  -- terakhir datang 10 minggu lalu, online, pijat
  ('00000000-0000-0000-00dd-000000000002', 'Eka Baru',        '6281300000002'),  -- datang minggu lalu (walk-in)
  ('00000000-0000-0000-00dd-000000000003', 'Fani Berhenti',   '6281300000003');  -- minta berhenti (STOP)
update customers set promo_opt_out = true where id = '00000000-0000-0000-00dd-000000000003';
insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, source, status) values
  ('00000000-0000-0000-00dd-000000000001', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), now() - interval '70 days', 30, 'online', 'completed'),
  ('00000000-0000-0000-00dd-000000000002', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), now() - interval '7 days', 30, 'walk_in', 'completed');
-- kunjungan & belanja (customer_stats dihitung dari transaksi)
insert into transactions (id, customer_id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00dd-0000000000a1', '00000000-0000-0000-00dd-000000000001', 100000, 100000, 100000, 'cash', now() - interval '70 days'),
  ('00000000-0000-0000-00dd-0000000000a2', '00000000-0000-0000-00dd-000000000002', 75000, 75000, 75000, 'cash', now() - interval '7 days');
insert into transaction_items (transaction_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00dd-0000000000a1', 'Pijat Fullbody + Kop', 'massage', 100000, 100000),
  ('00000000-0000-0000-00dd-0000000000a2', 'Potong Rambut', 'barbershop', 75000, 75000);

create temp view mine as select name from campaign_audience('{}') where customer_id::text like '00000000-0000-0000-00dd-%';
grant select on mine to authenticated;

select tests.login(tests.kasir());
select throws_like($$ select * from campaign_audience('{}') $$, '%Akses ditolak%', 'kasir tidak bisa melihat/mengirim blast');

select tests.login(tests.mgr());
select set_eq($$ select name from mine $$, $$ values ('Dodi Lama Pergi'), ('Eka Baru') $$, 'tanpa filter: semua ber-WA kecuali yang minta berhenti');
select set_eq($$ select name from campaign_audience('{"inactive_weeks": 8}') where customer_id::text like '00000000-0000-0000-00dd-%' $$,
              $$ values ('Dodi Lama Pergi') $$, 'lama tidak datang ≥ 8 minggu');
select set_eq($$ select name from campaign_audience('{"categories": ["massage"]}') where customer_id::text like '00000000-0000-0000-00dd-%' $$,
              $$ values ('Dodi Lama Pergi') $$, 'pernah memakai pijat');
select set_eq($$ select name from campaign_audience('{"min_spend": 90000}') where customer_id::text like '00000000-0000-0000-00dd-%' $$,
              $$ values ('Dodi Lama Pergi') $$, 'pelanggan setia: total belanja ≥ 90rb');
select set_eq($$ select name from campaign_audience('{"online": false}') where customer_id::text like '00000000-0000-0000-00dd-%' $$,
              $$ values ('Eka Baru') $$, 'belum pernah booking online');

insert into campaigns (id, name, message, segment) values ('00000000-0000-0000-00dd-0000000000c1', 'Kangen kamu',
  'Hai {nama}, ada diskon 10% booking online!', '{"inactive_weeks": 8, "categories": ["massage"]}');
select is((send_campaign('00000000-0000-0000-00dd-0000000000c1') ->> 'recipients')::int,
          (select count(*)::int from campaign_audience('{"inactive_weeks": 8, "categories": ["massage"]}')), 'campaign terkirim ke seluruh segmen');
-- dipakai ulang: ubah pesan, kirim lagi → pengiriman kedua dengan snapshot pesan baru, yang pertama tetap
update campaigns set message = 'Hai {nama}, masih ada diskon 10%!' where id = '00000000-0000-0000-00dd-0000000000c1';
select is((send_campaign('00000000-0000-0000-00dd-0000000000c1') ->> 'recipients')::int,
          (select count(*)::int from campaign_audience('{"inactive_weeks": 8, "categories": ["massage"]}')), 'campaign bisa dikirim lagi');
select results_eq($$ select message from campaign_sends where campaign_id = '00000000-0000-0000-00dd-0000000000c1' order by created_at, message $$,
  $$ values ('Hai {nama}, ada diskon 10% booking online!'), ('Hai {nama}, masih ada diskon 10%!') $$, 'riwayat menyimpan pesan saat dikirim');
select tests.su();
select is((select body from outbound_messages where customer_id = '00000000-0000-0000-00dd-000000000001' and template = 'promo' order by created_at limit 1),
          E'Hai Dodi, ada diskon 10% booking online!\n\n— ' || (select shop_name from settings) || E'\nTidak ingin menerima info promo? Balas STOP.',
          '{nama} = nama depan + cara berhenti');
select is((select count(*) from outbound_messages where customer_id = '00000000-0000-0000-00dd-000000000001' and template = 'promo' and to_address = '6281300000001'),
          2::bigint, 'dikirim ke WA pelanggan (2 pengiriman)');
select is((select count(*) from outbound_messages where customer_id = '00000000-0000-0000-00dd-000000000003'), 0::bigint, 'yang minta berhenti tidak dikirimi');

select tests.login(tests.mgr());
insert into campaigns (id, name, message, segment) values ('00000000-0000-0000-00dd-0000000000c2', 'Kosong', 'Hai {nama}, promo!', '{"min_visits": 9999}');
select throws_like($$ select send_campaign('00000000-0000-0000-00dd-0000000000c2') $$, '%Tidak ada penerima%', 'segmen kosong ditolak');
select tests.login(tests.kasir());
select is((select count(*) from campaigns), 0::bigint, 'kasir tidak melihat campaign');

select * from finish();
rollback;
