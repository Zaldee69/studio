begin;
\ir helpers.psql
select plan(13);

-- Otomatisasi manajemen: ajak potong lagi, minta ulasan, cek tengah minggu, rapor capster, rapor tindakan rapat AI.
select tests.su();
create temp table ids (k text primary key, id uuid);
with x as (insert into customers (name, whatsapp) values ('Budi Lama', '6281300000001') returning id) insert into ids select 'lama', id from x;
with x as (insert into customers (name, whatsapp) values ('Cici Booking', '6281300000002') returning id) insert into ids select 'booking', id from x;
with x as (insert into customers (name, whatsapp) values ('No Name', '6281300000003') returning id) insert into ids select 'baru', id from x;
-- Budi & Cici terakhir datang 4,5 minggu lalu (batas churn 4 minggu); Cici sudah punya booking → tidak disapa
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
select id, 50000, 50000, 50000, 'cash', now() - interval '31 days' from ids where k in ('lama', 'booking');
insert into appointments (customer_id, resource_id, staff_id, start_at, duration_min, end_at, status)
select (select id from ids where k = 'booking'), r.id, tests.staff_andi(), now() + interval '2 days', 30, now() + interval '2 days 30 minutes', 'booked'
from resources r where r.type = 'barbershop' limit 1;
-- No Name bayar 3 jam lalu (minta ulasan), transaksi 30 menit lalu belum ikut
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
values ((select id from ids where k = 'baru'), 50000, 50000, 50000, 'qris', now() - interval '3 hours');

select is(auto_followup(), 0, 'ajak potong lagi: mati bawaan');
update settings set auto_followup_on = true;
select is(auto_followup(), 1, 'ajak potong lagi: hanya yang baru lewat batas & belum punya booking');
select ok(exists (select 1 from outbound_messages where customer_id = (select id from ids where k = 'lama') and template = 'promo'
                  and body like 'Halo Budi!%' and send_id is not null), 'pesan memakai template follow-up dengan nama depan');
select ok(exists (select 1 from followup_events where customer_id = (select id from ids where k = 'lama')), 'tercatat sebagai follow-up (laporan)');
select is(auto_followup(), 0, 'tidak disapa ulang dalam jendela follow-up');

select is(auto_review_request(), 0, 'minta ulasan: mati selama link kosong');
update settings set google_review_url = 'https://g.page/r/contoh/review';
select ok(auto_review_request() >= 1, 'minta ulasan: pelanggan yang bayar 2–24 jam lalu');
select ok(exists (select 1 from outbound_messages where customer_id = (select id from ids where k = 'baru')
                  and body like 'Halo Kak, terima kasih%https://g.page/r/contoh/review%'), 'No Name disapa "Kak" + link ulasan');
select is(auto_review_request(), 0, 'sekali per pelanggan');

select lives_ok($$ select alert_midweek() $$, 'cek tengah minggu jalan');
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '📊 Cek tengah minggu%Kam %target 22%'), 'cek tengah minggu masuk antrean Telegram');

-- rapor capster: Andi memotong minggu lalu, nomornya diisi di akun
update profiles set phone = '0812 9999 0001' where id = tests.andi();
with t as (insert into transactions (subtotal, total, paid_amount, payment_method, created_at)
           values (75000, 75000, 75000, 'cash', jkt(date_trunc('week', jkt_today() - 7)::date + 1, '11:00')) returning id)
insert into transaction_items (transaction_id, service_id, staff_id, name, category, price, net_amount)
select t.id, s.id, tests.staff_andi(), s.name, 'barbershop', s.price, s.price from t, services s where s.name = 'Potong Rambut';
select is(staff_weekly_report(), 1, 'rapor capster terkirim ke capster yang bernomor');

-- rapat AI: notulen minggu sebelumnya ikut dibaca rapat berikutnya
insert into ai_meetings (week, notes) values (date_trunc('week', jkt_today() - 7)::date - 7, 'Tindakan: Andi target 4 tambahan');
select is(ai_weekly_facts() ->> 'notulen_rapat_sebelumnya', 'Tindakan: Andi target 4 tambahan', 'rapat dibuka dengan notulen minggu sebelumnya');

select * from finish();
rollback;
