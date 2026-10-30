begin;
\ir helpers.psql
select plan(8);

-- Analitik Paket B (rapat 31 Okt): antrean walk-in, tanda "diminta pelanggan", rapor terapis, voucher per kode, kelengkapan HPP.
select tests.su();
insert into staff (id, name, category, whatsapp) values ('00000000-0000-0000-00f4-0000000000a1', 'Terapis Rapor', 'massage', '081299994001');
-- Sabtu 2 Feb 2030: dua walk-in — satu menunggu 20 menit, satu pulang sebelum dilayani; satu booking biasa
insert into appointments (id, resource_id, staff_id, start_at, duration_min, source, status, guest_name) values
  ('00000000-0000-0000-00f4-000000000001', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-02-02', '10:20'), 30, 'walk_in', 'booked', 'Antre Satu'),
  ('00000000-0000-0000-00f4-000000000002', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-02-02', '11:00'), 30, 'walk_in', 'booked', 'Antre Dua'),
  ('00000000-0000-0000-00f4-000000000003', (select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-02-02', '12:00'), 30, 'online', 'booked', 'Booking');
update appointments set status = 'completed', arrived_at = jkt('2030-02-02', '10:00'), service_started_at = jkt('2030-02-02', '10:20'),
  service_ended_at = jkt('2030-02-02', '10:50') where id = '00000000-0000-0000-00f4-000000000001';
update appointments set status = 'cancelled', cancel_reason = 'Pulang sebelum dilayani' where id = '00000000-0000-0000-00f4-000000000002';

select tests.login(tests.kasir());
select mark_walk_in_turn('00000000-0000-0000-00f4-000000000001', true);
select mark_walk_in_turn('00000000-0000-0000-00f4-000000000003', true);
select tests.su();
select is((select requested_staff from appointments where id = '00000000-0000-0000-00f4-000000000001'), true, 'walk-in ditandai diminta pelanggan');
select is((select requested_staff from appointments where id = '00000000-0000-0000-00f4-000000000003'), null::boolean, 'booking online tidak bisa ditandai');

select tests.login(tests.mgr());
set local role postgres;
select is((kpi_queue('2030-02-02', '2030-02-02') ->> 'wait_median_weekend')::numeric, 20::numeric, 'tunggu = mulai − datang (akhir pekan)');
select is((kpi_queue('2030-02-02', '2030-02-02') ->> 'walk_aways')::int, 1, 'pulang sebelum dilayani terhitung');
select ok(kpi_dashboard('2030-02-02', '2030-02-02') ? 'queue', 'antrean ikut di dasbor');
select ok(owner_report_extra(jkt_today(), jkt_today()) ?& array['hpp_items', 'hpp_items_filled'], 'kelengkapan HPP di laporan owner');
select ok(coalesce((select bool_and(x ?& array['net', 'commission', 'studio']) from jsonb_array_elements(campaign_report(jkt_today() - 30, jkt_today()) -> 'vouchers') x), true),
  'voucher per kode: omzet, komisi, bagian studio');

-- rapor minggu lalu untuk terapis
select tests.su();
with t as (
  insert into transactions (subtotal, total, paid_amount, payment_method, created_at)
  values (80000, 80000, 80000, 'cash', jkt(date_trunc('week', jkt_today() - 7)::date + 1, '10:00')) returning id)
insert into transaction_items (transaction_id, staff_id, service_id, name, category, price, net_amount)
select t.id, '00000000-0000-0000-00f4-0000000000a1', s.id, s.name, 'massage', 80000, 80000
from t, (select id, name from services where category = 'massage' order by name limit 1) s;
select staff_weekly_report();
select ok(exists (select 1 from outbound_messages where to_address = '6281299994001' and template = 'staff_report'
                  and body like '📋 Rapor minggu%Terapis Rapor%Pelanggan pijat 1 (%'), 'rapor mingguan juga untuk terapis');

select * from finish();
rollback;
