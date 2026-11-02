begin;
\ir helpers.psql
select plan(6);

-- Audit tumpang tindih Gelombang 3 (1 Nov): Senin satu pesan (TT-16), push hanya yang mendesak (TT-18),
-- follow-up saling cek dengan blast (TT-19).
select tests.su();
delete from outbound_messages where template = 'alert';

-- ---------- TT-16 ----------
select ok(position('alert_weekly_summary' in pg_get_functiondef('alert_morning()'::regprocedure)) = 0, 'alert pagi tidak lagi mengirim ringkasan Senin terpisah');
select weekly_summary_fallback();
select weekly_summary_fallback();
select is((select count(*) from outbound_messages where template = 'alert' and body like '📈 Ringkasan minggu%'), 1::bigint,
  'cadangan 09.00: ringkasan dikirim sekali bila rapat AI tidak masuk antrean');

-- ---------- TT-18: push hanya untuk booking terkonfirmasi yang mulai ≤ 2 jam ----------
select ok(position($$new.status = 'pending_review'$$ in pg_get_functiondef('notify_staff_push()'::regprocedure)) > 0, 'push tidak untuk booking menunggu konfirmasi');
select ok(position($$interval '2 hours'$$ in pg_get_functiondef('notify_staff_push()'::regprocedure)) > 0, 'push hanya untuk yang mulai ≤ 2 jam lagi');

-- ---------- TT-19: blast dalam jendela follow-up → tidak disapa otomatis lagi ----------
create temp table ids (k text primary key, id uuid);
with x as (insert into customers (name, whatsapp) values ('Budi Blast', '6281300000011') returning id) insert into ids select 'blast', id from x;
with x as (insert into customers (name, whatsapp) values ('Dodi Diam', '6281300000012') returning id) insert into ids select 'diam', id from x;
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
select id, 50000, 50000, 50000, 'cash', now() - interval '31 days' from ids;
with c as (insert into campaigns (name, message) values ('Tes blast', 'Halo Kak, ada slot kosong minggu ini di studio.') returning id),
     s as (insert into campaign_sends (campaign_id, message, segment) select id, 'halo', '{}' from c returning id)
insert into outbound_messages (channel, to_address, template, customer_id, send_id, body, created_at)
select 'whatsapp', '6281300000011', 'promo', (select id from ids where k = 'blast'), s.id, 'blast', now() - interval '2 days' from s;
update settings set auto_followup_on = true;
select is(auto_followup(), 1, 'ajak potong lagi: hanya yang belum disapa');
select ok(not exists (select 1 from followup_events where customer_id = (select id from ids where k = 'blast')), 'yang baru menerima blast dilewati');

select * from finish();
rollback;
