begin;
\ir helpers.psql
select plan(19);

-- Pengeluaran: aturan kasir (hari ini, laci, ≤ kas kecil), nota wajib > Rp100.000, laci mengurangi kas diharapkan,
-- final setelah tutup kasir, void hanya manajer, masuk owner_finance.
select tests.su();
delete from cash_closings where date in (jkt_today(), '2020-03-02');
update settings set petty_cash_limit = 200000, receipt_required_above = 100000;

select tests.login(tests.kasir());
select throws_like($$ select add_expense(jkt_today(), 'konsumsi', 'Galon', 150000, 'laci') $$, '%Foto nota wajib%', 'di atas Rp100.000 tanpa nota ditolak');
select lives_ok($$ select add_expense(jkt_today(), 'konsumsi', 'Galon air', 30000, 'laci') $$, 'kasir: Rp30.000 dari laci tanpa nota boleh');
select throws_like($$ select add_expense(jkt_today(), 'konsumsi', 'Galon', 250000, 'laci', 'expenses/x.webp') $$, '%batas kas kecil%', 'kasir: di atas batas kas kecil ditolak');
select throws_like($$ select add_expense(jkt_today(), 'sewa', 'Sewa', 50000, 'transfer') $$, '%dari laci%', 'kasir: hanya dari laci');
select throws_like($$ select add_expense(jkt_today() - 1, 'konsumsi', 'Kopi', 20000, 'laci') $$, '%hari ini%', 'kasir: hanya hari ini');
select is((select count(*) from expenses), 1::bigint, 'kasir hanya melihat pengeluaran hari ini');
select tests.login(tests.mgr()); -- rekap lengkap (kasir hanya melihatnya setelah tutup)
select is((cash_summary(jkt_today()) ->> 'expense_cash')::bigint, 30000::bigint, 'pengeluaran laci tercatat di rekap kasir');
select is((cash_summary(jkt_today()) ->> 'expected_cash')::bigint,
          (cash_summary(jkt_today()) ->> 'cash_sales')::bigint + (cash_summary(jkt_today()) ->> 'topup_cash')::bigint - 30000,
          'kas diharapkan = tunai jual + tunai top-up − pengeluaran laci');
select tests.login(tests.kasir());
select throws_like($$ select void_expense((select id from expenses limit 1), 'salah') $$, '%%', 'kasir tidak bisa membatalkan');

select tests.login(tests.mgr());
select lives_ok($$ select add_expense('2020-03-02', 'sewa', 'Sewa Maret', 3000000, 'transfer', 'expenses/sewa.pdf') $$, 'manajer: tanggal lampau, transfer, dengan nota');
select lives_ok($$ select add_expense('2020-03-02', 'konsumsi', 'Snack', 40000, 'laci') $$, 'manajer: laci tanggal lampau sebelum ditutup');
select save_cash_closing('2020-03-02', 0);
select throws_like($$ select void_expense((select id from expenses where description = 'Snack'), 'salah') $$, '%sudah final%', 'laci tanggal yang sudah ditutup tidak bisa dibatalkan');
select lives_ok($$ select void_expense((select id from expenses where description = 'Sewa Maret'), 'dobel input') $$, 'manajer membatalkan dengan alasan');
-- kasbon: wajib staf → potongan gaji bulan itu; batal → koreksi (+), total penyesuaian kembali 0
select throws_like($$ select add_expense(jkt_today(), 'kasbon', 'Pinjam', 50000, 'kas_toko') $$, '%Pilih staf%', 'kasbon tanpa staf ditolak');
select lives_ok($$ select add_expense(jkt_today(), 'kasbon', 'Keperluan keluarga', 50000, 'kas_toko', null, tests.staff_andi()) $$, 'kasbon Andi Rp50.000');
select is((select amount from payroll_adjustments where staff_id = tests.staff_andi() and reason like 'Kasbon %Keperluan keluarga'), -50000::bigint,
          'kasbon menjadi potongan gaji bulan ini');
select lives_ok($$ select void_expense((select id from expenses where category = 'kasbon' and description = 'Keperluan keluarga'), 'batal pinjam') $$, 'batalkan kasbon');
select is((select sum(amount) from payroll_adjustments where staff_id = tests.staff_andi() and (reason like 'Kasbon %Keperluan keluarga' or reason like 'Batal kasbon %batal pinjam')),
          0::numeric, 'batal kasbon menambah koreksi sehingga potongan hilang');

select tests.su();
select results_eq($$ select (f ->> 'expenses_total')::bigint, jsonb_array_length(f -> 'expenses_by_category') from owner_finance('2020-03-01', '2020-03-31') f $$,
                  $$ values (40000::bigint, 1) $$, 'owner_finance: hanya yang tidak dibatalkan');

select * from finish();
rollback;
