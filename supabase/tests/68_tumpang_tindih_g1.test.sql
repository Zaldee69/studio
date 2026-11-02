begin;
\ir helpers.psql
select plan(9);

-- Audit tumpang tindih Gelombang 1 (1 Nov): biaya staf laporan owner dari bayaran nyata (TT-12), notifikasi semua kolom
-- upah (TT-20), satu definisi "potong" (TT-8) dan akhir pekan Jum–Min (TT-9).
select tests.su();
delete from outbound_messages where template = 'alert';
create function pg_temp.n(p text) returns bigint language sql as $$ select count(*) from outbound_messages where template = 'alert' and body like p $$;

-- ---------- TT-12: staf mingguan = bayaran mingguan yang ditutup; staf bayar bulanan = gaji bulanan ----------
insert into commission_weeks (week_start, status)
select w::date, 'closed' from generate_series(date '2030-02-25', date '2030-03-31', interval '1 week') w on conflict (week_start) do nothing;
insert into commission_week_pays (week_start, staff_id, month, service_count, revenue_net, commission_service, commission_retail, amount, subsidy, kasbon)
values ('2030-03-04', tests.staff_andi(), '2030-03-01', 10, 600000, 240000, 0, 190000, 0, 50000);
update staff set pay_monthly = true, base_salary = 3000000 where id = tests.staff_sari();
select tests.login(tests.mgr()); set local role postgres;  -- owner_payroll internal (dipanggil owner_report)
select is((owner_payroll('2030-03-01', '2030-03-31') -> 'by_staff' ->> tests.staff_andi()::text)::bigint, 190000::bigint,
  'staf mingguan: biaya = bayaran mingguan yang ditutup (sudah dipotong kasbon)');
select is((owner_payroll('2030-03-01', '2030-03-31') -> 'by_staff' ->> tests.staff_sari()::text)::bigint, 3000000::bigint,
  'staf bayar bulanan: biaya = gaji bulanan (gaji pokok)');
select ok((owner_payroll('2030-03-01', '2030-03-31') ->> 'all_closed')::boolean, 'semua minggu bulan itu ditutup → final');
select ok(not (owner_payroll('2030-04-01', '2030-04-30') ->> 'all_closed')::boolean, 'ada minggu belum ditutup → belum final (laporan pakai estimasi)');

-- ---------- TT-20: semua kolom upah dilaporkan ----------
select tests.su();
delete from outbound_messages where template = 'alert';
update staff set base_salary = 3500000, deduct_hpp = true where id = tests.staff_sari();
select is(pg_temp.n('⚙️ Aturan bayaran Sari%Komisi dipotong HPP: default → ya%Gaji pokok: Rp3.000.000 → Rp3.500.000%'), 1::bigint,
  'ubah gaji pokok & potong HPP → satu notifikasi berisi keduanya');
update staff set name = name where id = tests.staff_sari();
select is(pg_temp.n('⚙️ Aturan bayaran Sari%'), 1::bigint, 'simpan tanpa ubah upah → tidak ada notifikasi');

-- ---------- TT-8: potong = layanan bertanda is_cut ----------
update transactions set voided_at = now(), void_reason = 'isolasi tes' where created_at >= jkt(jkt_today(), '00:00') and voided_at is null;
select tests.login(tests.kasir());
select checkout(format('{"method":"cash","items":[{"service_id":"%s","staff_id":"%s"},{"service_id":"%s","staff_id":"%s"},{"service_id":"%s","staff_id":"%s"}]}',
  tests.svc('Potong Rambut'), tests.staff_andi(), tests.svc('Cukur Jenggot'), tests.staff_andi(), tests.svc('Gel Polish Tangan'), tests.staff_sari())::jsonb);
select tests.su();
select is(staff_counts_text(jkt(jkt_today(), '00:00'), jkt(jkt_today() + 1, '00:00')), 'Andi 1 potong · Sari 1 layanan',
  'capster: hanya layanan bertanda potong; staf lain: jumlah layanan');
select ok((select not is_cut from services where name = 'Cukur Jenggot'), 'Cukur Jenggot tidak dihitung potong');

-- ---------- TT-9: akhir pekan = Jumat–Minggu ----------
select ok(position('dow >= 5' in pg_get_functiondef('campaign_report_data(date,date)'::regprocedure)) > 0, 'Campaign: akhir pekan mulai Jumat');

select * from finish();
rollback;
