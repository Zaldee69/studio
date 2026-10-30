begin;
\ir helpers.psql
select plan(6);

select tests.su();
delete from booking_attempts where key like 'lamar%';
select ok(apply_job('{"position": "capster", "name": "Deni Uji", "whatsapp": "0812 6666 0001", "ip": "8.8.8.8",
                      "answers": {"pengalaman_tahun": "7", "ekspektasi_gaji": "Rp3.500.000"}}') is not null, 'lamaran capster tersimpan');
select is((select status from job_applications where whatsapp = '6281266660001'), 'baru', 'status awal: baru');
select ok(exists (select 1 from outbound_messages where template = 'alert'
                  and body = '📝 Lamaran capster: Deni Uji (6281266660001) · pengalaman 7 th · minta Rp3.500.000'), 'owner dikabari lewat Telegram');
select throws_ok($$ select apply_job('{"position": "satpam", "name": "X Y", "whatsapp": "081266660002"}') $$, 'Pilih posisi');
select throws_ok($$ select apply_job('{"position": "kasir", "name": "Deni", "whatsapp": "081266660001"}'),
                         apply_job('{"position": "kasir", "name": "Deni", "whatsapp": "081266660001"}'),
                         apply_job('{"position": "kasir", "name": "Deni", "whatsapp": "081266660001"}') $$,
  'Terlalu banyak percobaan, coba lagi nanti', 'percobaan ke-4 dalam sejam ditolak');

select tests.login(tests.kasir());
select is((select count(*) from job_applications), 0::bigint, 'kasir tidak bisa membaca lamaran');

select * from finish();
rollback;
