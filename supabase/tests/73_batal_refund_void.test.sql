begin;
\ir helpers.psql
select plan(4);
select tests.su();
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00f8-0000000000a1', 50000, 50000, 50000, 'cash', now());
insert into cash_closings (date) select jkt_today() on conflict do nothing;
select tests.login(tests.mgr());
select lives_ok($$ select void_transaction('00000000-0000-0000-00f8-0000000000a1', 'uji', true) $$, 'void');
select tests.su();
select isnt((select refund_date from transactions where id = '00000000-0000-0000-00f8-0000000000a1'), null, 'refund terisi');
select tests.login(tests.mgr());
select lives_ok($$ select batalkan_refund_void('00000000-0000-0000-00f8-0000000000a1', 'salah sumber') $$, 'batal refund');
select tests.su();
select is((select refund_date from transactions where id = '00000000-0000-0000-00f8-0000000000a1'), null, 'refund kosong');
select * from finish();
rollback;
