begin;
\ir helpers.psql
select plan(4);

-- Stok bahan menipis: Telegram owner saat melewati ambang (sekali, bersama lonceng aplikasi) + daftar di ringkasan pagi.
select tests.su();
insert into inventory_items (id, name, kind, unit, unit_cost, reorder_at) values ('00000000-0000-0000-00f5-000000000001', 'Uji Clay', 'consumable', 'g', 381, 80);
insert into stock_moves (item_id, qty, type, unit_cost) values ('00000000-0000-0000-00f5-000000000001', 100, 'in', 381);
insert into stock_moves (item_id, qty, type) values ('00000000-0000-0000-00f5-000000000001', -10, 'use');
select is((select count(*) from outbound_messages where template = 'alert' and body like '%Stok menipis: Uji Clay%'), 0::bigint, 'masih di atas ambang → tidak ada pesan');

insert into stock_moves (item_id, qty, type) values ('00000000-0000-0000-00f5-000000000001', -15, 'use');
select is((select body from outbound_messages where template = 'alert' and body like '%Stok menipis: Uji Clay%'),
  E'📦 Stok menipis: Uji Clay\nSisa 75 g (ambang 80). Pesan lewat Inventaris → Daftar belanja.', 'melewati ambang → Telegram owner');
insert into stock_moves (item_id, qty, type) values ('00000000-0000-0000-00f5-000000000001', -5, 'use');
select is((select count(*) from outbound_messages where template = 'alert' and body like '%Stok menipis: Uji Clay%'), 1::bigint, 'tidak dikirim ulang selama belum ditangani');

select alert_low_stock();
select ok((select body from outbound_messages where template = 'alert' and body like '📦 Bahan yang perlu dipesan:%' order by created_at desc limit 1)
  like '%• Uji Clay: sisa 70 g (ambang 80)%', 'ringkasan pagi menyebut bahan yang masih menipis');

select * from finish();
rollback;
