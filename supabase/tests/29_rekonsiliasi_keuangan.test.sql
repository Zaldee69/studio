begin;
\ir helpers.psql
select plan(26);

-- Rekonsiliasi keuangan satu hari kerja: semua jenis uang masuk/keluar, lalu angka dicocokkan silang antara
-- tutup kasir, laporan owner, deposit, komisi, dan saldo laci besok. Angka harapan dihitung dari tabel mentah.
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date >= jkt_today() - 1;
alter table cash_closings enable trigger cash_closings_immutable;
-- hari ini tanpa transaksi/pengeluaran/stok lain (dibatalkan di akhir)
update transactions set voided_at = now(), void_reason = 'isolasi tes' where created_at >= jkt(jkt_today(), '00:00') and voided_at is null;
delete from expenses where date = jkt_today();
update settings set drawer_start_date = jkt_today(), drawer_start_balance = 500000, commission_basis = 'net';
insert into customers (name, whatsapp) values ('Rekon Deposit', '6289911110000') returning id as cid \gset
insert into inventory_items (name, kind, unit, unit_cost) values ('Rekon sabun', 'consumable', 'botol', 10000) returning id as item \gset
select (select count(*) from transactions where created_at >= jkt(jkt_today(), '00:00')) as tx_before \gset

select tests.login(tests.kasir());
-- 1 tunai · 2 QRIS + tips 20rb · 3 transfer · 4 top-up tunai (bonus) · 5 deposit + tunai, barber+nail (diskon paket) · 6 tunai lalu di-void
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx1 \gset
select checkout(jsonb_build_object('method', 'qris', 'qris_ref', 'REKONQ' || left(md5(random()::text), 6), 'tip', 20000, 'tip_staff_id', tests.staff_andi(),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx2 \gset
select checkout(jsonb_build_object('method', 'transfer', 'qris_ref', 'REKONT' || left(md5(random()::text), 6),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari())))) as tx3 \gset
select topup_deposit(:'cid', 'cash', (select id from deposit_packages where active order by amount_paid limit 1));
select checkout(jsonb_build_object('method', 'cash', 'customer_id', :'cid', 'use_deposit', true, 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Hair Coloring'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Gel Polish Tangan'), 'staff_id', tests.staff_sari()),
  jsonb_build_object('service_id', tests.svc('Nail Art per set'), 'staff_id', tests.staff_sari())))) as tx4 \gset
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Cukur Jenggot'), 'staff_id', tests.staff_andi())))) as tx5 \gset
select add_expense(jkt_today(), 'konsumsi', 'Galon', 30000, 'laci');

select tests.login(tests.mgr());
select void_transaction(:'tx5', 'salah input');
select add_expense(jkt_today(), 'kasbon', 'Kasbon Andi', 50000, 'laci', null, tests.staff_andi());
select receive_stock(:'item', 1, 15000, p_paid_from => 'laci');

-- ---------- angka harapan dari tabel mentah ----------
select tests.su();
select
  (select sum(paid_amount) from transactions where id in (:'tx1', :'tx4') and payment_method in ('cash', 'deposit_cash')) as cash_in,
  (select paid_amount from transactions where id = :'tx2') as qris_in,
  (select paid_amount from transactions where id = :'tx3') as trf_in,
  (select amount_paid from deposit_topups where customer_id = :'cid') as topup_paid,
  (select amount_credited from deposit_topups where customer_id = :'cid') as topup_credit,
  (select deposit_used from transactions where id = :'tx4') as dep_used,
  (select sum(total) from transactions where id in (:'tx1', :'tx2', :'tx3', :'tx4')) as omzet,
  (select discount_amount from transactions where id = :'tx4') as disc4 \gset

select tests.login(tests.mgr());
select cash_summary(jkt_today()) as cs \gset
select is((:'cs'::jsonb ->> 'tx_count')::int, 4, 'transaksi void tidak dihitung');
select is((:'cs'::jsonb ->> 'opening_cash')::bigint, 500000::bigint, 'saldo awal laci dari Pengaturan');
select is((:'cs'::jsonb ->> 'cash_sales')::bigint, :cash_in::bigint, 'pemasukan tunai = tunai tx1 + bagian tunai tx4 (deposit tidak dihitung tunai)');
select is((:'cs'::jsonb ->> 'qris_sales')::bigint, :qris_in::bigint, 'pemasukan QRIS (tanpa tips)');
select is((:'cs'::jsonb ->> 'transfer_sales')::bigint, :trf_in::bigint, 'pemasukan transfer');
select is((:'cs'::jsonb ->> 'topup_cash')::bigint, :topup_paid::bigint, 'top-up tunai = yang dibayar (bukan saldo + bonus)');
select is((:'cs'::jsonb ->> 'expense_cash')::bigint, 80000::bigint, 'pengeluaran laci = galon 30rb + kasbon 50rb');
select is((:'cs'::jsonb ->> 'stock_cash')::bigint, 15000::bigint, 'pembelian stok dari laci');
select is((:'cs'::jsonb ->> 'tip_qris')::bigint, 20000::bigint, 'tips diserahkan tunai dari laci');
select is((:'cs'::jsonb ->> 'expected_cash')::bigint, (500000 + :cash_in + :topup_paid - 80000 - 15000 - 20000)::bigint,
          'kas diharapkan = saldo awal + tunai masuk − pengeluaran laci − pembelian stok laci − tips');

-- ---------- laporan owner ----------
select tests.su();
select owner_finance(jkt_today(), jkt_today()) as f \gset
select is((:'f'::jsonb ->> 'net')::bigint, :omzet::bigint, 'omzet bersih = total transaksi tidak di-void (tanpa tips)');
select is(((:'f'::jsonb -> 'payments' ->> 'cash')::bigint + (:'f'::jsonb -> 'payments' ->> 'qris')::bigint
           + (:'f'::jsonb -> 'payments' ->> 'transfer')::bigint + (:'f'::jsonb -> 'payments' ->> 'deposit')::bigint), :omzet::bigint,
          'tunai + QRIS + transfer + deposit terpakai = omzet bersih');
select is((:'f'::jsonb -> 'payments' ->> 'tips_qris')::bigint, 20000::bigint, 'tips terpisah dari omzet');
select is((:'f'::jsonb ->> 'void_count')::int, 1, 'void tercatat terpisah');
select is((:'f'::jsonb ->> 'discount')::bigint, :disc4::bigint, 'diskon paket tercatat');
select is((:'f'::jsonb ->> 'expenses_total')::bigint, 80000::bigint, 'pengeluaran (termasuk kasbon) di laporan');
select set_config('request.jwt.claims', json_build_object('sub', tests.mgr(), 'role', 'authenticated')::text, true);
select is((owner_report_extra(jkt_today(), jkt_today()) ->> 'stock_purchases')::bigint, 15000::bigint, 'arus kas: pembelian stok');

-- ---------- deposit, kasbon, komisi ----------
select is((select deposit_balance from customer_stats where customer_id = :'cid'), (:topup_credit - :dep_used)::bigint,
          'saldo deposit = saldo dikreditkan − terpakai');
select is((select amount from payroll_adjustments where staff_id = tests.staff_andi() and reason like 'Kasbon %Kasbon Andi'), -50000::bigint,
          'kasbon menjadi potongan gaji');
select ok(not exists (select 1 from commission_lines(date_trunc('month', jkt_today())::date) l join transaction_items ti on ti.id = l.transaction_item_id
                      where ti.transaction_id = :'tx5'), 'transaksi void tidak menghasilkan komisi');

-- ---------- tutup kasir & saldo laci besok ----------
select tests.login(tests.kasir());
select save_cash_closing(jkt_today(), (:'cs'::jsonb ->> 'expected_cash')::bigint, '', 100000); -- kasir menghitung laci (rekap buta)
select tests.login(tests.mgr());
select is((select difference from cash_closings where date = jkt_today() order by created_at desc limit 1), 0::bigint, 'isi laci = kas diharapkan → selisih 0');
select tests.su();
select is(drawer_opening(jkt_today() + 1), (select physical_cash - 100000 from cash_closings where date = jkt_today() order by created_at desc limit 1),
          'saldo awal besok = isi laci − setoran');

-- ---------- void SETELAH tutup kasir ----------
-- QRIS bertips di-void: tips sudah diserahkan tunai → tetap mengurangi laci; tidak ada refund tunai (dikembalikan lewat bank)
select tests.login(tests.mgr());
select void_transaction(:'tx2', 'pelanggan komplain');
select is((cash_summary(jkt_today()) ->> 'tip_qris')::bigint, 20000::bigint, 'tips transaksi yang di-void tetap terhitung keluar dari laci');
select is((select refund_date from transactions where id = :'tx2'), null, 'void non-tunai: tanpa refund laci');
-- tunai di-void setelah tanggalnya ditutup: uang dikembalikan dari laci → refund dicatat besok (kasir hari ini sudah ditutup)
select void_transaction(:'tx1', 'salah layanan');
select is((select refund_date from transactions where id = :'tx1'), jkt_today() + 1, 'refund tunai jatuh di hari kasir berikutnya');
select is((cash_summary(jkt_today() + 1) ->> 'expected_cash')::bigint,
          (select physical_cash - 100000 - (select paid_amount from transactions where id = :'tx1') from cash_closings where date = jkt_today() order by created_at desc limit 1),
          'kas diharapkan besok = saldo awal − refund tunai');

select * from finish();
rollback;
