begin;
\ir helpers.psql
select plan(71);

create table tests.v (k text primary key, v text);
grant all on tests.v to anon, authenticated;
create function tests.get(k text) returns text language sql as $$ select v from tests.v where tests.v.k = $1 $$;
create function tests.put(k text, v text) returns text language sql as $$
  insert into tests.v values (k, v) on conflict (k) do update set v = excluded.v returning v $$;
create function tests.res(n text) returns uuid language sql security definer as $$ select id from public.resources where name = n $$;
grant execute on all functions in schema tests to anon, authenticated;

-- Hari contoh (bagian 4): Selasa 10 Mar 2026, buka 09:00–21:00 (720 menit).
select tests.su();
update opening_hours set open_time = '09:00', close_time = '21:00', closed = false;

-- =============================== RLS KPI (R1) ===============================
select tests.login(tests.kasir());
select throws_like($$ select kpi_summary('2026-03-10', '2026-03-10') $$, '%Akses ditolak%', 'R1 kasir: kpi_summary ditolak');
select tests.login(tests.andi());
select throws_like($$ select kpi_summary('2026-03-10', '2026-03-10') $$, '%Akses ditolak%', 'R1 kapster: kpi_summary ditolak');
select throws_like($$ select count(*) from mv_daily_sales $$, '%permission denied%', 'R1 kapster: MV analitik tertutup');

-- =============================== Data contoh T1–T5 ===============================
select tests.login(tests.kasir());
select tests.put('t1', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()))))::text);
select tests.put('t2', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Gel Polish Tangan'), 'staff_id', tests.staff_sari()))))::text);
select tests.put('t3', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()),
  jsonb_build_object('service_id', tests.svc('Gel Polish Tangan'), 'staff_id', tests.staff_sari()))))::text);
select tests.put('t4', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Pomade Matte'))))) ::text);
select tests.put('t5', checkout(jsonb_build_object('method', 'cash', 'items', jsonb_build_array(
  jsonb_build_object('service_id', tests.svc('Potong Rambut'), 'staff_id', tests.staff_andi()))))::text);
select tests.login(tests.mgr());
select void_transaction(tests.get('t5')::uuid, 'uji');
select tests.su();
alter table transactions disable trigger transactions_immutable;
update transactions set created_at = jkt('2026-03-10', '10:00') where id in (tests.get('t1')::uuid, tests.get('t2')::uuid, tests.get('t3')::uuid, tests.get('t4')::uuid, tests.get('t5')::uuid);

-- Kursi Barber 1: nyata 47 mnt (rencana 45) + rencana 60 mnt tanpa waktu nyata (14:30–15:30) = 107 menit. + satu no-show.
insert into appointments (resource_id, staff_id, start_at, duration_min, status, service_started_at, service_ended_at) values
  (tests.res('Kursi Barber 1'), tests.staff_andi(), jkt('2026-03-10', '10:00'), 45, 'completed', jkt('2026-03-10', '10:00'), jkt('2026-03-10', '10:47')),
  (tests.res('Kursi Barber 1'), tests.staff_andi(), jkt('2026-03-10', '14:30'), 60, 'completed', null, null);
insert into appointments (resource_id, staff_id, start_at, duration_min, status, source)
values (tests.res('Kursi Barber 2'), tests.staff_andi(), jkt('2026-03-10', '11:00'), 45, 'booked', 'online')
returning tests.put('ns', id::text);
insert into appointments (resource_id, staff_id, start_at, duration_min, status)
values (tests.res('Kursi Barber 3'), tests.staff_andi(), now() + interval '3 days', 45, 'booked') returning tests.put('fut', id::text);
insert into funnel_events (session_id, step, created_at)
select 'sesi-uji-' || i, s.step, jkt('2026-03-10', '09:00')
from generate_series(1, 10) i cross join lateral (values ('landing'), ('booking_open'), ('booked')) s(step)
where (s.step = 'landing') or (s.step = 'booking_open' and i <= 5) or (s.step = 'booked' and i <= 2);

-- no-show (tombol Tidak datang)
select tests.login(tests.kasir());
select throws_like(format($$ select set_appointment_status('%s', 'no_show') $$, tests.get('ns')), '%tidak datang%', 'no_show hanya lewat tombol Tidak datang');
select mark_no_show(tests.get('ns')::uuid);
select is((select status::text from appointments where id = tests.get('ns')::uuid), 'no_show', 'booking lewat jam → Tidak datang');
select throws_like(format($$ select mark_no_show('%s') $$, tests.get('fut')),
                   '%sudah lewat%', 'booking yang belum lewat tidak bisa ditandai tidak datang');

select tests.su();
select refresh_analytics(true);

-- =============================== 4.1–4.4 (U1–U4) ===============================
select tests.login(tests.mgr());
select tests.put('sum', kpi_summary('2026-03-10', '2026-03-10')::text);
select is((tests.get('sum')::jsonb #>> '{current,aov_barbershop}')::numeric, 71250::numeric, 'U1 AOV Barbershop = (75.000 + 67.500) ÷ 2 = 71.250');
select is((tests.get('sum')::jsonb #>> '{current,aov_nail}')::numeric, 171000::numeric, 'U1 AOV Nail = (180.000 + 162.000) ÷ 2 = 171.000');
select is((tests.get('sum')::jsonb #>> '{current,omzet}')::bigint, 594500::bigint, 'U2 omzet 594.500 (T5 void diabaikan)');
select is((tests.get('sum')::jsonb #>> '{current,tx_count}')::int, 4, 'U2 4 transaksi');
select is((tests.get('sum')::jsonb #>> '{current,aov_all}')::numeric, 148625::numeric, 'U2 AOV keseluruhan 148.625');
select is(round((tests.get('sum')::jsonb #>> '{current,retail_ratio}')::numeric, 1), 22.7, 'U3 rasio ritel 110.000 ÷ 484.500 = 22,7%');
select is(tests.get('sum')::jsonb #>> '{delta,omzet}', null, 'U11 periode lalu 0 → delta kosong ("baru")');
select results_eq($$ select round(avg_services, 2), round(bundle_pct, 1), round(upsell_rate, 1) from kpi_aov_drivers('2026-03-10', '2026-03-10') where category = 'service' $$,
  $$ values (1.33::numeric, 33.3::numeric, 0.0::numeric) $$, 'U4 layanan/tx 1,33 · bundle 33,3% · upsell 0%');
select results_eq($$ select aov_barbershop, aov_nail, tx_barbershop, tx_nail, omzet from kpi_aov_daily('2026-03-10', '2026-03-10') $$,
  $$ values (71250::bigint, 171000::bigint, 2, 2, 594500::bigint) $$, 'AOV harian = kartu (satu definisi)');
select is((kpi_summary('2026-03-10', '2026-03-10', 'nail') #>> '{current,omzet}')::bigint, 342000::bigint, 'filter Nail: omzet layanan nail saja');
select is((kpi_retail('2026-03-10', '2026-03-10') -> 'top' -> 0 ->> 'name'), 'Pomade Matte', 'top produk ritel');
select is((kpi_revenue_mix('2026-03-10', '2026-03-10') -> 'mix' -> 2 ->> 'revenue')::bigint, 110000::bigint, 'porsi omzet ritel');

-- =============================== 4.5–4.7 (U5–U7) ===============================
select results_eq($$ select sold_minutes, available_minutes, round(pct, 1), round(pct_planned, 1) from kpi_utilization('2026-03-10', '2026-03-10') where name = 'Kursi Barber 1' $$,
  $$ values (107::numeric, 720::numeric, 14.9::numeric, 14.6::numeric) $$, 'U5 utilisasi 107 ÷ 720 = 14,9% (rencana 105 = 14,6%)');
select tests.su();
insert into special_closures (date, reason) values ('2026-03-11', 'uji');
select is(open_minutes('2026-03-09', '2026-03-15'), 4320::numeric, 'U5 7 hari dengan 1 hari libur → 6 × 720 = 4.320 menit');
select tests.login(tests.mgr());
select results_eq($$ select hour, minutes_avg from kpi_heatmap('2026-03-10', '2026-03-10', 'barbershop') where weekday = 2 and hour in (10, 14, 15) order by hour $$,
  $$ values (10, 47::numeric), (14, 30::numeric), (15, 30::numeric) $$, 'U6 14:30–15:30 terbagi 30 menit di jam 14 & 15');
select ok((select bool_and(closed) from kpi_heatmap('2026-03-10', '2026-03-10') where weekday <> 2), 'U6 hari di luar periode = Tutup/tanpa data');
select tests.su();
insert into appointments (resource_id, staff_id, start_at, duration_min, status, service_started_at, service_ended_at)
select tests.res('Kursi Barber 3'), tests.staff_andi(), jkt('2026-03-12', '09:00') + (i || ' hours')::interval, 30, 'completed',
       jkt('2026-03-12', '09:00') + (i || ' hours')::interval, jkt('2026-03-12', '09:36') + (i || ' hours')::interval
from generate_series(1, 4) i;
insert into appointment_services (appointment_id, service_id)
select id, tests.svc('Hair Spa') from appointments where start_at::date between '2026-03-12' and '2026-03-13' and resource_id = tests.res('Kursi Barber 3');
select refresh_analytics(true);
select tests.login(tests.mgr());
select is((select count(*) from kpi_duration_variance('2026-03-12', '2026-03-12')), 0::bigint, 'U7 n = 4 → belum ditampilkan');
select tests.su();
with a as (insert into appointments (resource_id, staff_id, start_at, duration_min, status, service_started_at, service_ended_at)
           values (tests.res('Kursi Barber 3'), tests.staff_andi(), jkt('2026-03-12', '16:00'), 30, 'completed', jkt('2026-03-12', '16:00'), jkt('2026-03-12', '16:36')) returning id)
insert into appointment_services (appointment_id, service_id) select id, tests.svc('Hair Spa') from a;
select tests.login(tests.mgr());
select results_eq($$ select name, diff_avg, n from kpi_duration_variance('2026-03-12', '2026-03-12') $$,
  $$ values ('Hair Spa'::text, 6::numeric, 5) $$, 'U7 n = 5 → Hair Spa +6 mnt');

-- =============================== 4.9 (U10) ===============================
select results_eq($$ select (o->>'landing')::int, (o->>'booking_open')::int, (o->>'booked')::int, round((o->>'no_show_rate')::numeric, 1) from kpi_online('2026-03-10', '2026-03-10') o $$,
  $$ values (10, 5, 2, 33.3::numeric) $$, 'U10 funnel 10 → 5 → 2; no-show 1 ÷ (2 + 1) = 33,3%');

-- =============================== 4.11 Insight (U12) ===============================
select results_eq($$ select code from kpi_insights('2026-03-10', '2026-03-10') $$,
  $$ values ('aov_barbershop'::text), ('aov_nail'), ('low_util') $$, 'U12 maks 3, urut prioritas');
update settings set aov_target_barbershop = 70000, aov_target_nail = 190000;  -- nail tepat 10% di bawah → tidak terpicu
select results_eq($$ select code from kpi_insights('2026-03-10', '2026-03-10') $$,
  $$ values ('low_util'::text), ('retail_ratio'), ('no_show') $$, 'U12 AOV tepat di ambang tidak terpicu');
select ok((select message from kpi_insights('2026-03-10', '2026-03-10') where code = 'retail_ratio') = 'Rasio ritel 22,7%, di atas target 15–20%.', 'U12 teks rasio ritel');
update settings set aov_target_barbershop = 120000, aov_target_nail = 200000;

-- =============================== 4.8 Pelanggan (U8, U9) ===============================
select tests.su();
insert into customers (name, whatsapp) values ('Kembali 45', '6281277000045'), ('Kembali 62', '6281277000062');
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
select c.id, 75000, 75000, 75000, 'cash', jkt(d, '10:00')
from (values ('Kembali 45', date '2026-08-01'), ('Kembali 45', date '2026-09-15'), ('Kembali 62', date '2026-08-01'), ('Kembali 62', date '2026-10-02')) v(n, d)
join customers c on c.name = v.n;
insert into transactions (subtotal, total, paid_amount, payment_method, created_at) values (75000, 75000, 75000, 'cash', jkt('2026-08-01', '11:00'));
insert into customers (name) select 'FU ' || i from generate_series(1, 20) i;
insert into followup_events (customer_id, created_at) select id, jkt('2026-06-01', '10:00') from customers where name like 'FU %';
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
select id, 75000, 75000, 75000, 'cash', jkt('2026-06-15', '10:00') from customers where name in ('FU 1', 'FU 2', 'FU 3', 'FU 4', 'FU 5');
insert into transactions (customer_id, subtotal, total, paid_amount, payment_method, created_at)
select id, 75000, 75000, 75000, 'cash', jkt('2026-07-20', '10:00') from customers where name = 'FU 6';  -- 49 hari → di luar 30 hari
select tests.login(tests.mgr());
select results_eq($$ select (c->>'return_eligible')::int, (c->>'return_back')::int, round((c->>'return_rate')::numeric, 1), (c->>'new_customers')::int
                     from kpi_customers('2026-08-01', '2026-08-31', '2026-12-31') c $$,
  $$ values (2, 1, 50.0::numeric, 2) $$, 'U8 45 hari = kembali, 62 hari = tidak; walk-in dikecualikan');
select is((kpi_customers('2026-08-01', '2026-08-31', '2026-09-15') ->> 'return_eligible')::int, 0, 'U8 pengamatan < 60 hari dikecualikan');
select results_eq($$ select (c->>'followup_sent')::int, (c->>'followup_converted')::int, round((c->>'followup_rate')::numeric, 1) from kpi_customers('2026-06-01', '2026-06-30') c $$,
  $$ values (20, 5, 25.0::numeric) $$, 'U9 follow-up 5 ÷ 20 = 25%');
select tests.put('fu7', (select id::text from customers where name = 'FU 7'));
select tests.login(tests.kasir());
select lives_ok(format($$ insert into followup_events (customer_id, sent_by) values ('%s', auth.uid()) $$, tests.get('fu7')),
                'kasir mencatat follow-up');
select is((select count(*) from followup_events), 0::bigint, 'kasir tidak membaca daftar follow-up');
select tests.login(tests.andi());
select throws_like(format($$ insert into followup_events (customer_id, sent_by) values ('%s', auth.uid()) $$, tests.get('fu7')),
                   '%row-level security%', 'kapster tidak bisa mencatat follow-up');

-- =============================== Pengingat SOP ===============================
select tests.su();
select is(sop_reminders(jkt(jkt_today(), '11:00')), 0, 'sebelum jam pengingat → tidak ada notifikasi');
select ok(sop_reminders(jkt(jkt_today(), '12:05')) >= 2, 'E6 12:05 tanpa log → notifikasi kapster bertugas + manajer');
select tests.login(tests.andi());
select is((select count(*) from notifications where kind = 'sop_reminder'), 1::bigint, 'Andi (ada booking hari ini) mendapat pengingat');
select tests.su();
select is(sop_reminders(jkt(jkt_today(), '12:30')), 0, 'pengingat sekali per hari');

-- =============================== SOP (U13, R2, R3, R5) ===============================
create function tests.grp(i int) returns uuid language sql security definer as $$ select id from public.sop_tool_groups where active order by sort offset i - 1 limit 1 $$;
grant execute on function tests.grp(int) to authenticated;
select tests.login(tests.andi());
select tests.put('w1', record_sop_stage(tests.grp(1), 'wash')::text);
select is((select done_by from sop_logs where id = tests.get('w1')::uuid), tests.andi(), 'R2 kapster mencatat hari ini; done_by = dirinya');
select throws_like($$ select sop_day(jkt_today() - 1) $$, '%hari ini%', 'R2 kapster tidak bisa membuka kemarin');
select throws_like(format($$ insert into sop_logs (date, group_id, stage) values (jkt_today() - 1, '%s', 'wash') $$, tests.grp(2)),
                   '%row-level security%', 'R2 kapster tidak bisa menulis log langsung (kemarin)');
select throws_like($$ select record_sop_stage(tests.grp(1), 'autoclave') $$, '%Rendam%', 'U13 urutan: autoclave sebelum rendam ditolak');
select tests.put('s1', record_sop_stage(tests.grp(1), 'soak')::text);
select throws_like(format($$ select undo_sop_stage('%s') $$, tests.get('w1')), '%tahap berikutnya%', 'U13 batalkan Cuci saat Rendam aktif ditolak');
select undo_sop_stage(tests.get('s1')::uuid);
select isnt((select undone_at from sop_logs where id = tests.get('s1')::uuid), null, 'U13 batal = undone_at tercatat (bukan dihapus)');
select throws_like($$ select approve_sop_day(jkt_today()) $$, '%Akses ditolak%', 'R3 kapster tidak bisa mengotorisasi');
select tests.login(tests.kasir());
select is((select count(*) from sop_logs), 0::bigint, 'R5 kasir tidak membaca log SOP');
select tests.login(tests.andi());
do $$
declare g int; st sop_stage;
begin
  for g in 1..4 loop
    foreach st in array array['wash', 'soak', 'autoclave']::sop_stage[] loop
      if not (g = 1 and st = 'wash') and not (g = 4 and st = 'autoclave') then perform record_sop_stage(tests.grp(g), st); end if;
    end loop;
  end loop;
end $$;
select is((sop_day(jkt_today()) ->> 'done')::int, 11, '11 dari 12 tahap');
select tests.login(tests.mgr());
select throws_like($$ select approve_sop_day(jkt_today()) $$, '%belum lengkap%', 'U13 otorisasi 11/12 ditolak');
select record_sop_stage(tests.grp(4), 'autoclave', 1, 'indikator berubah warna', null, '00000000-0000-0000-0001-000000000002');
select is((sop_day(jkt_today()) #>> '{groups,3,stages,autoclave,on_behalf}'), 'Rizky', 'manajer mengisi atas nama staf');
select is(sop_day(jkt_today()) ->> 'status', 'done', 'status Lengkap, belum diotorisasi');
select approve_sop_day(jkt_today());
select is(sop_day(jkt_today()) ->> 'status', 'ok', 'status Diotorisasi');
select tests.login(tests.andi());
select throws_like(format($$ select undo_sop_stage('%s') $$, tests.get('w1')), '%diotorisasi%', 'U13 setelah otorisasi batal ditolak');
select throws_like($$ select record_sop_stage(tests.grp(1), 'wash') $$, '%diotorisasi%', 'U13 setelah otorisasi catat ditolak');
select tests.su();
select throws_like(format($$ delete from sop_logs where id = '%s' $$, tests.get('w1')), '%tidak bisa dihapus%', 'P6 log SOP tidak bisa dihapus');
update settings set sop_shifts = 2;
select tests.login(tests.andi());
select lives_ok($$ select record_sop_stage(tests.grp(1), 'wash', 2) $$, 'U13 shift 2 independen dari shift 1 yang sudah diotorisasi');
select is((select count(*) from sop_history(jkt_today(), jkt_today())), 2::bigint, 'riwayat per shift');
select tests.su();
update settings set sop_require_photo_autoclave = true;
select tests.login(tests.andi());
select record_sop_stage(tests.grp(2), 'wash', 2);
select record_sop_stage(tests.grp(2), 'soak', 2);
select throws_like($$ select record_sop_stage(tests.grp(2), 'autoclave', 2) $$, '%Foto indikator%', 'foto autoclave wajib bila diaktifkan');
select lives_ok($$ select record_sop_stage(tests.grp(2), 'autoclave', 2, null, jkt_today() || '/' || auth.uid() || '/a.jpg') $$, 'autoclave dengan foto');

-- Laporan kepatuhan: 27 dari 30 hari diotorisasi → 90%.
select tests.su();
update settings set sop_shifts = 1, sop_require_photo_autoclave = false;
alter table sop_logs disable trigger sop_logs_locked;
insert into sop_logs (date, shift, group_id, stage, done_by)
select d::date, 1, g.id, st, tests.andi() from generate_series(date '2026-05-01', date '2026-05-30', interval '1 day') d
cross join sop_tool_groups g cross join unnest(array['wash', 'soak', 'autoclave']::sop_stage[]) st where g.active;
insert into sop_approvals (date, shift, approved_by)
select d::date, 1, tests.mgr() from generate_series(date '2026-05-01', date '2026-05-27', interval '1 day') d;
select tests.login(tests.mgr());
select results_eq($$ select (r->>'operational')::int, (r->>'ok')::int, round((r->>'compliance_pct')::numeric, 1) from sop_compliance_report('2026-05-01', '2026-05-30') r $$,
  $$ values (30, 27, 90.0::numeric) $$, '% hari patuh 27 ÷ 30 = 90%');

-- =============================== Perawatan (U14, R4) ===============================
select tests.su();
insert into maintenance_tasks (name, interval_days, created_at) values ('HVAC uji', 14, jkt('2026-08-01', '08:00')), ('Tahun baru uji', 14, jkt('2026-08-01', '08:00'));
insert into maintenance_logs (task_id, done_by, note, cost, vendor, created_at)
select id, tests.mgr(), 'servis rutin', 350000, 'Teknisi AC', jkt('2026-09-12', '10:00') from maintenance_tasks where name = 'HVAC uji';
insert into maintenance_logs (task_id, done_by, created_at) select id, tests.mgr(), jkt('2026-12-25', '10:00') from maintenance_tasks where name = 'Tahun baru uji';
select tests.login(tests.mgr());
select results_eq($$ select next_due, days_left, status from maintenance_status('2026-09-28') where name = 'HVAC uji' $$,
  $$ values ('2026-09-26'::date, -2, 'overdue'::text) $$, 'U14 terakhir 12 Sep + 14 → 26 Sep; 28 Sep → terlambat 2 hari');
select is((select status from maintenance_status('2026-09-26') where name = 'HVAC uji'), 'due', 'U14 tepat jatuh tempo');
select is((select status from maintenance_status('2026-09-25') where name = 'HVAC uji'), 'soon', 'U14 1 hari lagi = kuning');
select is((select status from maintenance_status('2026-09-22') where name = 'HVAC uji'), 'ok', 'U14 4 hari lagi = hijau');
select results_eq($$ select next_due, days_left from maintenance_status('2027-01-05') where name = 'Tahun baru uji' $$,
  $$ values ('2027-01-08'::date, 3) $$, 'U14 lintas tahun');
select tests.su();
select ok(maintenance_reminders('2026-09-28') >= 1, 'pengingat perawatan terlambat → notifikasi manajer');
select is(maintenance_reminders('2026-09-28'), 0, 'pengingat perawatan sekali per hari');
select tests.login(tests.andi());
select is((select count(*) from maintenance_logs), 0::bigint, 'R4 kapster tidak membaca tabel log (biaya)');
select is((select history -> 0 ->> 'cost' from maintenance_status('2026-09-28') where name = 'HVAC uji'), null, 'R4 riwayat untuk kapster tanpa biaya');
select throws_like(format($$ select maintenance_mark_done('%s', 'x', null, 1000) $$, (select task_id from maintenance_status() where name = 'HVAC uji')),
                   '%Biaya hanya%', 'kapster tidak bisa mengisi biaya');
select lives_ok(format($$ select maintenance_mark_done('%s', 'filter dibersihkan') $$, (select task_id from maintenance_status() where name = 'HVAC uji')),
                'kapster menandai selesai');
select is((select status from maintenance_status() where name = 'HVAC uji'), 'ok', 'setelah ditandai → 14 hari lagi');

select * from finish();
rollback;
