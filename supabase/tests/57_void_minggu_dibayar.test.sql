begin;
\ir helpers.psql
select plan(3);

-- Audit UANG-3 (1 Nov, pilihan A): void ditolak bila minggu komisi staf di transaksi itu sudah ditutup/dibayar.
select tests.su();
insert into staff (id, name, category, commission_pct_override) values ('00000000-0000-0000-00f7-000000000001', 'Uji Void', 'barbershop', 50);
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00f7-0000000000a1', 100000, 100000, 100000, 'transfer', jkt('2030-03-05', '10:00')),
  ('00000000-0000-0000-00f7-0000000000a2', 50000, 50000, 50000, 'transfer', jkt('2030-03-13', '10:00'));
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00f7-0000000000a1', '00000000-0000-0000-00f7-000000000001', 'Potong', 'barbershop', 100000, 100000),
  ('00000000-0000-0000-00f7-0000000000a2', '00000000-0000-0000-00f7-000000000001', 'Potong', 'barbershop', 50000, 50000);
-- minggu 4–10 Mar 2030 sudah ditutup (komisi dibekukan)
insert into commission_weeks (week_start, status) values ('2030-03-04', 'closed');
insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount, subsidy, kasbon)
values ('2030-03-04', '00000000-0000-0000-00f7-000000000001', '2030-03-01', 1, 100000, 50000, 0, 50000, 0, 0);

select tests.login(tests.mgr());
select throws_like($$ select void_transaction('00000000-0000-0000-00f7-0000000000a1', 'uji') $$,
  '%Komisi minggu itu sudah dibayar ke Uji Void%', 'void transaksi di minggu yang sudah dibayar ditolak');
select lives_ok($$ select void_transaction('00000000-0000-0000-00f7-0000000000a2', 'uji') $$, 'void di minggu yang belum ditutup tetap bisa');
select tests.su();
select ok((select voided_at is null from transactions where id = '00000000-0000-0000-00f7-0000000000a1'), 'transaksi minggu dibayar tetap utuh');

select * from finish();
rollback;
