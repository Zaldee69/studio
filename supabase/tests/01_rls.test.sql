begin;
\ir helpers.psql
select plan(42);

-- Data: satu transaksi bundle untuk Rina + top-up deposit (dibuat sebagai manajer).
select tests.login(tests.mgr());
select topup_deposit((select customer_id from profiles where id = tests.rina()), 'cash',
                     (select id from deposit_packages where name = 'Classic'));
select checkout(jsonb_build_object(
  'items', jsonb_build_array(
    jsonb_build_object('service_id', tests.svc('Potong Rambut'),
                       'appointment_id', (select a.id from appointments a join profiles p on p.customer_id = a.customer_id
                                          where p.id = tests.rina())),
    jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari())),
  'method', 'cash'));

-- ---------- Kasir ----------
select tests.login(tests.kasir());
select is((select count(*) from transaction_item_costs), 0::bigint, 'kasir: tidak melihat HPP transaksi');
select is((select count(*) from inventory_items), 0::bigint, 'kasir: tidak melihat inventaris');
select is((select count(*) from service_materials), 0::bigint, 'kasir: tidak melihat resep HPP');
select is((select count(*) from stock_moves), 0::bigint, 'kasir: tidak melihat mutasi stok');
select is((select count(*) from settings), 0::bigint, 'kasir: tidak membaca settings sensitif');
update settings set bundle_pct = 15;  -- RLS: 0 baris, dicek di bagian manajer
select throws_like($$ select * from commission_for_period(current_date) $$, '%Akses ditolak%', 'kasir: tidak bisa lihat komisi');
select is((select count(*) from public_settings), 1::bigint, 'kasir: membaca public_settings');
select ok((select count(*) from transactions) > 0, 'kasir: membaca transaksi toko');
select ok((select deposit_balance from customer_stats where deposit_balance > 0 limit 1) > 0, 'kasir: melihat saldo deposit');

-- ---------- Kapster (Andi) ----------
select tests.login(tests.andi());
select ok((select count(*) from appointments) > 0, 'kapster: melihat booking miliknya');
select is((select count(*) from appointments where staff_id is distinct from tests.staff_andi()), 0::bigint,
          'kapster: hanya booking miliknya');
select is((select count(*) from inventory_items), 0::bigint, 'kapster: tidak melihat harga modal');
select is((select count(*) from transaction_item_costs), 0::bigint, 'kapster: tidak melihat HPP');
select is((select count(*) from transactions), 0::bigint, 'kapster: tidak melihat transaksi toko');
select is((select count(*) from transaction_items), 0::bigint, 'kapster: tidak melihat item transaksi');
select is((select count(*) from deposit_topups), 0::bigint, 'kapster: tidak melihat deposit');
select is((select count(*) from customer_stats), 0::bigint, 'kapster: tidak melihat statistik/saldo pelanggan');
select is((select count(*) from staff), 1::bigint, 'kapster: hanya baris staf dirinya');
select is((select count(*) from commission_for_period(current_date)), 1::bigint, 'kapster: hanya komisinya');
select is((select count(*) from customers), 0::bigint, 'kapster: tabel customers tertutup (no. WA tidak terkirim; pakai staff_customer_card)');
select throws_like($$ update profiles set role = 'manager' where id = auth.uid() $$, '%Hanya manajer%',
                   'kapster: tidak bisa menaikkan peran sendiri');
select throws_like($$ select update_customer_notes((select id from customers where name = 'Lina'), 'x') $$,
                   '%Akses ditolak%', 'kapster: tidak bisa ubah catatan pelanggan orang lain');

-- ---------- Pelanggan (Rina) ----------
select tests.login(tests.rina());
select is((select count(*) from customers) + (select count(*) from my_customer), 1::bigint,
          'pelanggan: hanya dirinya lewat my_customer (tabel customers & catatan internal tertutup)');
select is((select count(*) from appointments where customer_id is distinct from my_customer_id()), 0::bigint,
          'pelanggan: hanya booking miliknya');
select is((select count(*) from transactions where customer_id is distinct from my_customer_id()), 0::bigint,
          'pelanggan: hanya transaksinya');
select is((select count(*) from customer_stats), 1::bigint, 'pelanggan: hanya statistiknya');
select is((select count(*) from profiles), 1::bigint, 'pelanggan: hanya profilnya');

-- ---------- Anon ----------
select tests.anon();
select is((select count(*) from services), 0::bigint, 'anon: tabel services tertutup');
select is((select count(*) from customers), 0::bigint, 'anon: customers tertutup');
select is((select count(*) from appointments), 0::bigint, 'anon: appointments tertutup');
select ok((select count(*) from public_services) > 0, 'anon: membaca public_services');
select ok((select count(*) from public_staff) > 0, 'anon: membaca public_staff');
select throws_like($$ select checkout('{"items":[],"method":"cash"}') $$, '%Akses ditolak%', 'anon: tidak bisa checkout');
select throws_like($$ select deposit_balance_of(gen_random_uuid()) $$, '%permission denied%', 'anon: helper internal tertutup');

-- ---------- Transaksi hanya lewat RPC ----------
select tests.login(tests.mgr());
select is((select bundle_pct from settings), 10, 'kasir: update settings tidak berlaku');
update transactions set total = 0;  -- RLS: tanpa policy update → 0 baris
select is((select count(*) from transactions where total = 0), 0::bigint, 'manajer: tidak bisa update transaksi langsung');
select throws_like($$ insert into transactions (subtotal, total, paid_amount, payment_method) values (1, 1, 1, 'cash') $$,
                   '%row-level security%', 'manajer: tidak bisa insert transaksi langsung');
select tests.su();
select throws_like($$ delete from transactions $$, '%tidak bisa dihapus%', 'bahkan superuser: transaksi tidak bisa dihapus');

-- ---------- Pendaftaran tim ----------
select throws_like($$ insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'x@t.test', '{"signup":"team","invite_code":"SALAH","role":"cashier"}') $$,
  '%Kode undangan%', 'daftar tim: kode undangan salah ditolak');
select throws_like($$ insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'x@t.test', '{"signup":"team","invite_code":"GB-2026","role":"manager"}') $$,
  '%Peran tidak valid%', 'daftar tim: tidak bisa daftar sebagai manajer');
insert into auth.users (id, email, raw_user_meta_data) values
  (gen_random_uuid(), 'y@t.test', '{"signup":"team","invite_code":"GB-2026","role":"staff"}');
select results_eq($$ select role::text, active from profiles where email = 'y@t.test' $$,
                  $$ values ('staff', false) $$, 'daftar tim: akun baru nonaktif sampai diaktifkan manajer');
select throws_like($$ update profiles set active = true where email = 'y@t.test' $$, '%staff_needs_link%',
                   'akun kapster wajib ditautkan ke staf sebelum aktif');

select * from finish();
rollback;
