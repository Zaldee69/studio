begin;
\ir helpers.psql
select plan(6);

-- Audit SEC-1 (1 Nov): gaji, aturan komisi & No. WA staf hanya terbaca manajer.
select tests.login(tests.kasir());
select ok((select count(*) from staff where name is not null) > 0, 'kasir tetap membaca nama & kategori staf');
select throws_ok($$ select base_salary from staff $$, '42501', null, 'kasir tidak bisa membaca gaji pokok');
select throws_ok($$ select commission_pct_override, daily_min_pay, whatsapp from staff $$, '42501', null, 'kasir tidak bisa membaca aturan komisi & No. WA staf');
select throws_like($$ select * from staff_private() $$, '%Akses ditolak%', 'kasir tidak bisa memanggil staff_private');

select tests.login(tests.andi());
select throws_ok($$ select base_salary from staff $$, '42501', null, 'capster tidak bisa membaca gaji lewat tabel');

select tests.login(tests.mgr());
select ok((select count(*) from staff_private()) = (select count(*) from staff), 'manajer membaca gaji semua staf lewat staff_private');

select * from finish();
rollback;
