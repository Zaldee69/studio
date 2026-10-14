begin;
\ir helpers.psql
select plan(8);

-- Rilis harga: draft pricelist tidak terlihat sampai manajer merilis; semua berlaku serentak.
select tests.su();
update services set release_action = 'retire' where name = 'Potong Rambut';
select price as p0 from services where name = 'Cukur Jenggot' \gset
update services set next_price = :p0 + 5000 where name = 'Cukur Jenggot';
select ok(not exists (select 1 from public_services where name = 'Fresh Groom'), 'draft belum tampil di publik/booking');
select is((select price from services where name = 'Cukur Jenggot'), :p0::bigint, 'harga berikutnya belum berlaku');

select tests.login(tests.kasir());
select throws_like($$ select release_prices() $$, '%Akses ditolak%', 'kasir tidak bisa merilis');

select tests.login(tests.mgr());
select lives_ok($$ select release_prices() $$, 'manajer merilis');
select tests.su();
select ok(exists (select 1 from public_services where name = 'Fresh Groom' and price = 60000), 'paket baru aktif');
select ok(not (select active from services where name = 'Potong Rambut'), 'layanan lama pensiun');
select is((select price from services where name = 'Cukur Jenggot'), (:p0 + 5000)::bigint, 'harga berikutnya berlaku');
select tests.login(tests.mgr());
select throws_like($$ select release_prices() $$, '%Tidak ada perubahan%', 'tidak ada yang dirilis dua kali');

select * from finish();
rollback;
