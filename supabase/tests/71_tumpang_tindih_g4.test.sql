begin;
\ir helpers.psql
select plan(6);

-- Audit tumpang tindih Gelombang 4 (1 Nov): definisi pelanggan (TT-10, TT-11), minggu WIB (TT-7), komisi resep (TT-13),
-- label naik paket (TT-23).
select tests.su();

-- ---------- TT-11: pelanggan terhapus tidak "perlu follow-up" ----------
with c as (insert into customers (name, whatsapp, deleted_at) values ('Terhapus', '6281300000021', now()) returning id)
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
select id, 50000, 50000, 50000, 'cash', now() - interval '90 days' from c;
select tests.login(tests.mgr());
select ok(not (select is_churn from customer_stats s join customers c on c.id = s.customer_id where c.name = 'Terhapus'),
  'pelanggan terhapus tidak dihitung perlu follow-up');
select tests.su();

-- ---------- TT-10 ----------
select ok(weekly_summary_text() like '%Transaksi dengan pelanggan: %', 'ringkasan Senin: transaksi dengan pelanggan tercatat (bukan ber-WA)');

-- ---------- TT-7 ----------
select ok(position('jkt_today' in pg_get_function_arguments('funnel_summary'::regproc)) > 0, 'booking online minggu ini: awal minggu WIB');

-- ---------- TT-13: komisi resep mengikuti aturan potong HPP ----------
update settings set commission_deduct_hpp = false, commission_pct = 50 where id;
select is((select commission from service_margins where name = 'Hair Spa'), (select round(price * 0.5)::bigint from services where name = 'Hair Spa'),
  'tanpa potong HPP: komisi = harga × %');
update settings set commission_deduct_hpp = true where id;
select is((select commission from service_margins where name = 'Hair Spa'), (select round((price - hpp) * 0.5)::bigint from service_margins where name = 'Hair Spa'),
  'potong HPP: komisi = (harga − HPP) × %');

-- ---------- TT-23 ----------
select ok(position('Paket Groom' in pg_get_functiondef('staff_weekly_report()'::regprocedure)) = 0, 'rapor capster memakai label "Naik paket"');

select * from finish();
rollback;
