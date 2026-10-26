begin;
\ir helpers.psql
select plan(17);

-- Notifikasi Telegram lanjutan: tiap kejadian di bawah pernah terjadi di prod (void, kasbon salah kategori, transaksi Rabu
-- dicatat Kamis, komisi minggu 12–18 Okt ditutup tapi belum dibayar, dst.).
select tests.su();
alter table cash_closings disable trigger cash_closings_immutable;
delete from cash_closings where date >= jkt_today() - 1;
alter table cash_closings enable trigger cash_closings_immutable;
update transactions set voided_at = now(), void_reason = 'isolasi tes' where created_at >= jkt(jkt_today(), '00:00') and voided_at is null;
delete from expenses where date = jkt_today();
update settings set drawer_start_date = jkt_today() - 1, drawer_start_balance = 500000, alert_cash_diff = 50000, alert_expense_min = 150000;
delete from outbound_messages where template = 'alert';
-- jumlah alert yang cocok dengan pola
create function pg_temp.n(p text) returns bigint language sql as $$ select count(*) from outbound_messages where template = 'alert' and body like p $$;

select is(fmt_minggu('2026-10-19'), '19–25 Okt 2026', 'label minggu');
select is(fmt_minggu('2026-09-28'), '28 Sep–4 Okt 2026', 'label minggu lintas bulan');

-- ---------- pengeluaran ----------
select tests.login(tests.mgr());
select add_expense(jkt_today(), 'kasbon', 'Kasbon Andi', 50000, 'laci', null, tests.staff_andi());
select add_expense(jkt_today(), 'lainnya', 'Rohman kasbon buat makan', 100000, 'laci');
select add_expense(jkt_today(), 'perbaikan', 'Servis AC', 200000, 'laci', 'expenses/nota.jpg');
select tests.su();
select (select count(*) from outbound_messages where template = 'alert') as before_small \gset
select tests.login(tests.mgr());
select add_expense(jkt_today(), 'konsumsi', 'Air galon', 20000, 'laci');
select tests.su();
select is(pg_temp.n('💸 Kasbon Andi: Rp50.000 (laci)%Total kasbon Andi minggu%'), 1::bigint, 'kasbon → nama, jumlah, total minggu ini');
select is(pg_temp.n('⚠️ Kemungkinan kasbon salah kategori: "Rohman kasbon buat makan" Rp100.000 dicatat sebagai lainnya%'), 1::bigint,
  'kata "kasbon" di kategori lain → peringatan salah kategori');
select is(pg_temp.n('🧾 Pengeluaran besar: Rp200.000 (perbaikan, dari laci)%'), 1::bigint, 'pengeluaran ≥ batas → notifikasi');
select is((select count(*) from outbound_messages where template = 'alert'), :before_small::bigint, 'pengeluaran kecil biasa → tanpa notifikasi');

-- ---------- void ----------
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi())))) as tx1 \gset
select tests.login(tests.mgr());
select void_transaction(:'tx1', 'salah input');
select tests.su();
select is(pg_temp.n('🚫 Transaksi DIBATALKAN Rp%(tunai)%Isi: Potong Rambut (Andi)%Alasan: salah input%'), 1::bigint, 'void → jumlah, isi, alasan');

-- ---------- transaksi terlambat ----------
-- (a) layanan dari appointment kemarin (kasus Mang Deni: Rabu dicatat Kamis)
insert into appointments (resource_id, staff_id, start_at, duration_min, status, guest_name)
values ((select id from resources order by sort limit 1), tests.staff_andi(), jkt(jkt_today() - 1, '06:00'), 30, 'completed', 'Mang Deni')
returning id as appt \gset
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'qris', 'qris_ref', 'LATE' || left(md5(random()::text), 6),
  'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi(), 'appointment_id', :'appt'))));
select tests.su();
select is(pg_temp.n('⏰ Transaksi tercatat terlambat%Layanannya dari%hari yang salah%'), 1::bigint, 'appointment kemarin dibayar hari ini → notifikasi');
-- (b) transaksi tunai masuk setelah kasir hari ini ditutup
select tests.login(tests.mgr());
select (cash_summary(jkt_today()) ->> 'expected_cash')::bigint as exp \gset
select save_cash_closing(jkt_today(), :exp, '', 0);
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(jsonb_build_object('service_id', tests.svc('Cukur Jenggot'), 'staff_id', tests.staff_andi()))));
select tests.su();
select is(pg_temp.n('⏰ Transaksi tercatat terlambat%sudah ditutup sebelum transaksi ini masuk: uang tunai%tutup ulang%'), 1::bigint,
  'tunai setelah tutup kasir → notifikasi tutup ulang');

-- ---------- perubahan yang memengaruhi uang ----------
update services set price = price + 1000 where name in ('Potong Rambut', 'Cukur Jenggot');
select is(pg_temp.n('💲 Layanan diubah oleh sistem (2):%Cukur Jenggot: Rp%→ Rp%Potong Rambut: Rp%'), 1::bigint,
  'ubah 2 harga dalam satu simpan → satu pesan berisi keduanya');
update settings set commission_pct = commission_pct + 1;
select is(pg_temp.n('⚙️ Pengaturan diubah oleh sistem:%Komisi default (%%):%'), 1::bigint, 'ubah komisi default → notifikasi');
update staff set daily_min_pay = 123000 where id = tests.staff_andi();
select is(pg_temp.n('⚙️ Aturan bayaran Andi%Jaring harian:%Rp123.000%'), 1::bigint, 'ubah jaring harian staf → notifikasi');
insert into vouchers (code, kind, value, category) values ('TESNOTIF', 'pct', 10, 'barbershop');
select is(pg_temp.n('🎟️ Voucher TESNOTIF dibuat%10%%'), 1::bigint, 'voucher baru → notifikasi');
insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 'kasir.baru@example.com', jsonb_build_object('signup', 'team', 'invite_code', (select invite_code from settings), 'role', 'cashier', 'full_name', 'Kasir Baru'));
select is(pg_temp.n('👤 Akun tim baru mendaftar: Kasir Baru (kasir.baru@example.com) sebagai cashier%'), 1::bigint, 'pendaftaran akun tim → notifikasi');

-- ---------- terjadwal ----------
select alert_idle_staff();
select is(pg_temp.n('🪑%Andi%'), 0::bigint, 'staf yang sudah dapat pelanggan hari ini tidak disebut sepi');

insert into commission_weeks (week_start, status, closed_at) values (date_trunc('week', jkt_today())::date - 35, 'closed', now() - interval '3 days');
insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount)
values (date_trunc('week', jkt_today())::date - 35, tests.staff_andi(), date_trunc('month', date_trunc('week', jkt_today())::date - 35)::date, 4, 200000, 100000, 0, 100000);
select alert_unpaid_weeks();
select is(pg_temp.n('💰 Komisi sudah ditutup tapi BELUM DIBAYAR:%Andi Rp100.000%'), 1::bigint, 'komisi ditutup > 2 hari belum dibayar → pengingat');

select alert_weekly_summary();
select is(pg_temp.n('📈 Ringkasan minggu %Omzet Rp%Barbershop:%Pelanggan ber-WA:%Komisi minggu ini:%'), 1::bigint, 'ringkasan mingguan');

select * from finish();
rollback;
