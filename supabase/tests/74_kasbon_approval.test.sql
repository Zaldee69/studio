begin;
\ir helpers.psql
select plan(29);

-- Kasbon lewat pengajuan (T-8c19ecda). Owner (approver) = tests.mgr(); manajer lain = tests.sari() (dijadikan manajer); kasir = tests.kasir().
select tests.su();
update profiles set role = 'manager', active = true where id = tests.sari();
update settings set kasbon_approver = tests.mgr(), kasbon_weekly_limit = 200000, min_monthly_pay = 0;   -- su: auth.uid() null = bootstrap
insert into staff (id, name, category, commission_pct_override) values ('00000000-0000-0000-00ee-000000000001', 'Uji Kasbon Baru', 'barbershop', 50);
select count(*) as k0, coalesce(sum(amount), 0) as s0 from expenses where category = 'kasbon' \gset
select coalesce(sum(public.cash_day_net(jkt_today())), 0) as net0 from (select 1) x \gset

-- AC20: flag off = perilaku lama persis
select tests.login(tests.mgr());
select lives_ok($$ select add_expense(jkt_today(), 'kasbon', 'lama', 10000, 'laci', null, '00000000-0000-0000-00ee-000000000001') $$, 'AC20: flag off, add_expense(kasbon) tetap jalan');
select throws_like($$ select kasbon_request('00000000-0000-0000-00ee-000000000001', 50000, 'uji') $$, '%belum aktif%', 'flag off: pengajuan ditolak');
select tests.su();
update settings set kasbon_flow_on = true;
select tests.login(tests.mgr());

-- AC2 + AC20: flag on
select throws_like($$ select add_expense(jkt_today(), 'kasbon', 'x', 10000, 'laci', null, '00000000-0000-0000-00ee-000000000001') $$, '%lewat pengajuan%', 'AC2: add_expense(kasbon) ditolak flag on');
select lives_ok($$ select add_expense(jkt_today(), 'lainnya', 'bukan kasbon', 1000, 'kas_toko') $$, 'kategori lain tetap jalan');

-- AC1: kasir mengajukan
select tests.login(tests.kasir());
select kasbon_request('00000000-0000-0000-00ee-000000000001', 150000, 'uji satu') as r1 \gset
select set_config('t.r1', :'r1', false);
select is((select status from kasbon_requests where id = :'r1'), 'diajukan', 'AC1: status diajukan');
select tests.su();
select is((select count(*) from expenses where category = 'kasbon')::bigint + 0, :k0::bigint + 1, 'AC1: pengajuan tidak membuat expenses (hanya 1 baris dari tes flag-off)');
-- AC15: kasir hanya melihat miliknya
select tests.login(tests.mgr());
select kasbon_request('00000000-0000-0000-00ee-000000000001', 100000, 'uji dua (lewat limit)') as r2 \gset
select set_config('t.r2', :'r2', false);
select tests.login(tests.kasir());
select is((select count(*) from kasbon_requests), 1::bigint, 'AC15: kasir hanya melihat pengajuannya sendiri');

-- AC14: lewat limit tetap tersimpan
select tests.su();
select is((select over_limit from kasbon_requests where id = :'r2'), true, 'AC14: r2 over_limit tersimpan (150+100 > 200)');

-- AC3: bukan approver ditolak
select tests.login(tests.sari());
select throws_like($$ select kasbon_decide(current_setting('t.r1')::uuid, true) $$, '%Hanya owner%', 'AC3: manajer lain tak bisa setuju');
select tests.login(tests.kasir());
select throws_ok($$ select kasbon_decide(current_setting('t.r1')::uuid, true) $$, '42501', null, 'AC3: kasir tak bisa setuju');
-- AC13: manajer lain tak bisa ubah pengaturan kasbon
select tests.login(tests.sari());
select throws_like($$ update settings set kasbon_approver = tests.sari() $$, '%hanya bisa diubah owner%', 'AC13: manajer lain tak bisa ganti approver');
select throws_like($$ update settings set kasbon_weekly_limit = 99999999 $$, '%hanya bisa diubah owner%', 'AC13: manajer lain tak bisa ubah limit');

-- AC4 + AC14 + approve
select tests.login(tests.mgr());
select throws_like($$ select kasbon_decide(current_setting('t.r2')::uuid, false, '  ') $$, '%Catatan penolakan%', 'AC4: tolak wajib catatan');
select lives_ok($$ select kasbon_decide(current_setting('t.r1')::uuid, true) $$, 'r1 disetujui (150rb <= 200rb)');
select throws_like($$ select kasbon_decide(current_setting('t.r2')::uuid, true) $$, '%limit%', 'AC14: setuju tanpa override ditolak bila lewat limit');
-- AC14 override: r2 sisa limit 50rb, minta 100rb → override + catatan wajib
select throws_like($$ select kasbon_decide(current_setting('t.r2')::uuid, true, null, true) $$, '%Catatan override%', 'override wajib catatan');
select lives_ok($$ select kasbon_decide(current_setting('t.r2')::uuid, true, 'darurat', true) $$, 'AC14: override + catatan berhasil');
select is((select limit_override from kasbon_requests where id = :'r2'), true, 'AC14: override tercatat');

-- AC5/16/18: bayar
select throws_like($$ select kasbon_pay(current_setting('t.r1')::uuid, '') $$, '%Bukti transfer wajib%', 'AC5: tanpa bukti ditolak');
select throws_like($$ select kasbon_pay(current_setting('t.r1')::uuid, 'kasbon/lain/x.jpg') $$, '%folder kasbon%', 'AC16: path di luar kasbon/<id>/ ditolak');
select throws_like($$ select kasbon_pay(current_setting('t.r1')::uuid, 'kasbon/' || current_setting('t.r1') || '/ghaib.jpg') $$, '%tidak ditemukan%', 'AC16: berkas tak ada di storage ditolak');
select tests.su();
insert into storage.objects (bucket_id, name) values ('receipts', 'kasbon/' || :'r1' || '/bukti.jpg');
select tests.login(tests.mgr());
select kasbon_pay(:'r1'::uuid, 'kasbon/' || :'r1' || '/bukti.jpg') as e1 \gset
select set_config('t.e1', :'e1', false);
select throws_like($$ select kasbon_pay(current_setting('t.r1')::uuid, 'kasbon/' || current_setting('t.r1') || '/bukti.jpg') $$, '%belum disetujui / sudah dibayar%', 'AC18: klik ganda ditolak');
select tests.su();
select is((select count(*) from expenses where id = :'e1' and source = 'transfer' and category = 'kasbon' and receipt_path is not null and adjustment_id is not null)::int
        + (select count(*) from payroll_adjustments where id = (select adjustment_id from expenses where id = :'e1') and amount = -150000)::int, 2, 'AC5/18: tepat 1 expenses transfer + 1 payroll_adjustments');

-- AC7: kas laci tidak berubah oleh kasbon transfer (net0 diambil sebelum; add_expense lama 10rb laci dikecualikan)
select is((select cash_day_net(jkt_today())), :net0::bigint - 10000, 'AC7: cash_day_net hanya turun oleh kasbon laci lama (10rb), bukan kasbon transfer');

-- AC8: komisi mingguan memotong kasbon baru (komisi 50rb, utang 160rb = 150rb baru + 10rb uji flag-off) → dipotong 50rb, bayaran 0
insert into transactions (id, subtotal, total, paid_amount, payment_method, created_at) values
  ('00000000-0000-0000-00ee-0000000000a1', 100000, 100000, 100000, 'cash', jkt(date_trunc('week', jkt_today())::date, '00:01'));
insert into transaction_items (transaction_id, staff_id, name, category, price, net_amount) values
  ('00000000-0000-0000-00ee-0000000000a1', '00000000-0000-0000-00ee-000000000001', 'Potong', 'barbershop', 100000, 100000);
select tests.login(tests.mgr());
select results_eq($$ select kasbon, amount from commission_week(date_trunc('week', jkt_today())::date) where staff_id = '00000000-0000-0000-00ee-000000000001' $$,
  $$ values (50000::bigint, 0::bigint) $$, 'AC8: kasbon baru dipotong dari komisi (sisa dibawa)');

-- AC17 / AC9: void oleh non-approver ditolak; oleh owner membalik adjustment + limit longgar
select tests.login(tests.sari());
select throws_like($$ select void_expense(current_setting('t.e1')::uuid, 'coba') $$, '%Hanya owner%', 'AC17: manajer lain tak bisa void kasbon transfer');
select tests.login(tests.mgr());
select void_expense(:'e1'::uuid, 'uji');
select tests.su();
select is((select sum(amount) from payroll_adjustments where staff_id = '00000000-0000-0000-00ee-000000000001' and reason like '%Batal kasbon%')::bigint, 150000::bigint, 'AC9: void membalik payroll_adjustments');
select is(kasbon_week_used('00000000-0000-0000-00ee-000000000001', date_trunc('week', jkt_today())::date), 100000::bigint, 'AC17: kasbon dibayar yang di-void tak dihitung limit');

-- AC11: bulan gaji closed
insert into payroll_periods (month, status) values (date_trunc('month', jkt_today())::date, 'closed') on conflict (month) do update set status = 'closed';
select tests.login(tests.mgr());
select throws_like($$ select kasbon_request('00000000-0000-0000-00ee-000000000001', 10000, 'uji tutup') $$, '%sudah ditutup%', 'AC11: bulan closed ditolak');

select * from finish();
rollback;
