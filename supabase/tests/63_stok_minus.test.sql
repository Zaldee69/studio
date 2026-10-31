begin;
\ir helpers.psql
select plan(2);

-- Audit KPI-14 (1 Nov): stok minus terlihat di laporan owner & alert pagi.
select tests.su();
insert into inventory_items (id, name, kind, unit, unit_cost, reorder_at) values ('00000000-0000-0000-00f8-000000000001', 'Bahan Minus Uji', 'consumable', 'ml', 10, 0);
insert into stock_moves (item_id, qty, type, reason, note) values ('00000000-0000-0000-00f8-000000000001', -50, 'adjust', 'koreksi', 'uji');
select alert_low_stock();
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '⚠️ Stok minus%Bahan Minus Uji: -50 ml%'), 'alert pagi menyebut bahan minus (tanpa ambang)');

select tests.login(tests.mgr());
set local role postgres;
select ok((owner_inventory(jkt_today(), jkt_today()) ->> 'negative_items') like '%Bahan Minus Uji -50 ml%', 'laporan owner menyebut bahan minus');

select * from finish();
rollback;
