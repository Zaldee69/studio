begin;
\ir helpers.psql
select plan(6);

-- Dasar komisi: harga setelah diskon (default) vs harga normal (diskon ditanggung toko); disimpan per baris saat checkout.
select tests.su();
update settings set commission_basis = 'net';
select tests.login(tests.kasir());
-- barber + nail → diskon paket (sebagian diskon jatuh ke baris Potong Rambut)
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari())))) as tx1 \gset

select tests.su();
select ti.id as it1, ti.price as p1, ti.net_amount as n1 from transaction_items ti where ti.transaction_id = :'tx1' and ti.name = 'Potong Rambut' \gset
select ok(:n1 < :p1, 'diskon paket mengurangi harga bersih baris Potong Rambut');
select is((select commission_base from transaction_items where id = :'it1'), null, 'dasar "harga setelah diskon": tidak disimpan (pakai harga bersih)');
select is((select commission from commission_lines(date_trunc('month', jkt_today())::date) where transaction_item_id = :'it1'),
          (select round(greatest(0, :n1 - hpp) * pct / 100.0)::bigint from commission_lines(date_trunc('month', jkt_today())::date) where transaction_item_id = :'it1'),
          'komisi dari harga bersih − HPP');

update settings set commission_basis = 'gross';
select tests.login(tests.kasir());
select checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Manicure Basic'), 'staff_id', tests.staff_sari())))) as tx2 \gset
select tests.su();
select ti.id as it2 from transaction_items ti where ti.transaction_id = :'tx2' and ti.name = 'Potong Rambut' \gset
select is((select commission_base from transaction_items where id = :'it2'), :p1::bigint, 'dasar "harga normal": harga sebelum diskon tersimpan');
select is((select commission from commission_lines(date_trunc('month', jkt_today())::date) where transaction_item_id = :'it2'),
          (select round(greatest(0, :p1 - hpp) * pct / 100.0)::bigint from commission_lines(date_trunc('month', jkt_today())::date) where transaction_item_id = :'it2'),
          'komisi dari harga normal − HPP (diskon ditanggung toko)');
select is((select commission_base from transaction_items where id = :'it1'), null, 'transaksi sebelum perubahan tetap memakai harga bersih');

select * from finish();
rollback;
