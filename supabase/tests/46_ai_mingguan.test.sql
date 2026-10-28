begin;
\ir helpers.psql
select plan(5);

-- Analisis AI mingguan: angka ringkasan hanya untuk server (tanpa data pribadi); laporan campaign tetap khusus manajer.
select tests.su();
select ok(ai_weekly_facts() ?& array['minggu', 'target', 'minggu_ini', 'minggu_sebelumnya', 'transaksi', 'per_lini', 'stok_menipis'], 'angka mingguan lengkap');
select ok(ai_weekly_facts()::text !~ '62[0-9]{8,}', 'tidak memuat nomor WhatsApp pelanggan');

select tests.login(tests.mgr());
select throws_like($$ select ai_weekly_facts() $$, '%permission denied%', 'manajer pun tidak memanggil langsung (khusus server)');
select ok(campaign_report(jkt_today(), jkt_today()) ? 'cuts', 'Laporan campaign tetap jalan untuk manajer');
select tests.login(tests.kasir());
select throws_like($$ select campaign_report(jkt_today(), jkt_today()) $$, '%Akses ditolak%', 'kasir tetap ditolak');

select * from finish();
rollback;
