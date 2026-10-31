begin;
\ir helpers.psql
select plan(3);

-- Audit BOOK-4 (1 Nov): impor kontak menyimpan "tahu dari mana" satu batch.
select tests.login(tests.mgr());
select is((import_customers('[{"name":"Impor Satu","whatsapp":"081299996001","source":"teman"},{"name":"Impor Dua","whatsapp":"081299996002","source":""}]') ->> 'inserted')::int,
  2, 'dua kontak diimpor');
select tests.su();
select is((select source from customers where whatsapp = '6281299996001'), 'teman', 'sumber batch tersimpan');
select is((select source from customers where whatsapp = '6281299996002'), null, 'sumber kosong tetap null (klien lama)');

select * from finish();
rollback;
