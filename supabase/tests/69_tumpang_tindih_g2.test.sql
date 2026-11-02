begin;
\ir helpers.psql
select plan(7);

-- Audit tumpang tindih Gelombang 2 (1 Nov): target satu rumah (TT-1, TT-2) dan fakta AI dari data (TT-3).
select tests.su();
select throws_like($$ update settings set utilization_target = 150 where id $$, '%settings_utilization_target_pct%', 'utilisasi > 100% ditolak');
select throws_like($$ update settings set retail_ratio_min = 30, retail_ratio_max = 20 where id $$, '%settings_retail_ratio_band%', 'rasio ritel min > maks ditolak');

update settings set target_cuts_senkam = 6, target_customer_pct = 60 where id;
select is((ai_weekly_facts() -> 'target' ->> 'potong_senin_kamis_per_hari')::numeric, 6.0, 'rapat AI membaca target dari pengaturan');
select ok(not (ai_weekly_facts() ? 'konteks'), 'tidak ada lagi teks konteks tertulis tangan');

delete from vouchers where code = 'TESAI';
insert into vouchers (code, kind, value, max_discount, category, weekdays) values ('TESAI', 'pct', 10, 10000, 'barbershop', '1234');
select ok(exists (select 1 from jsonb_array_elements(ai_weekly_facts() -> 'fakta_studio' -> 'voucher_aktif') v
                  where v ->> 'kode' = 'TESAI' and v ->> 'potongan' = '10%' and v ->> 'maks_potongan' = 'Rp10.000'),
  'voucher aktif dibaca dari tabel voucher (persen + maks. potongan)');

delete from outbound_messages where template = 'alert';
select alert_midweek();
select ok(exists (select 1 from outbound_messages where template = 'alert' and body like '%target 24 (6,0/hari)%target 60%%'),
  'cek tengah minggu memakai target dari pengaturan');
select tests.login(tests.kasir());
select throws_ok($$ select ai_studio_facts() $$, '42501', null, 'fakta AI tidak bisa dipanggil kasir');

select * from finish();
rollback;
