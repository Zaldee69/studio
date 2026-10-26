begin;
\ir helpers.psql
select plan(5);

-- Tombol "Kirim WA tes": hanya manajer, nomor dinormalisasi, lewat antrean WA, maksimal 3 per 10 menit.
select tests.login(tests.kasir());
select throws_like($$ select send_test_wa('081299998888') $$, '%Akses ditolak%', 'kasir tidak bisa mengirim WA tes');

select tests.login(tests.mgr());
select send_test_wa('0812-9999-8888');
select is((select count(*) from outbound_messages where template = 'test' and channel = 'whatsapp' and to_address = '6281299998888'
             and body like 'Tes WhatsApp %'), 1::bigint, 'tes masuk antrean WA dengan nomor dinormalisasi');
select throws_like($$ select send_test_wa('12') $$, '%Nomor WhatsApp tidak valid%', 'nomor tidak valid ditolak');
select send_test_wa('081299998888'), send_test_wa('081299998888');
select throws_like($$ select send_test_wa('081299998888') $$, '%3 tes dalam 10 menit%', 'tes ke-4 dalam 10 menit ditolak');

select tests.su();
select throws_like($$ insert into outbound_messages (channel, to_address, template) values ('whatsapp', '6281299998888', 'test') $$,
  '%outbound_test_shape%', 'pesan tes wajib berisi teks');

select * from finish();
rollback;
