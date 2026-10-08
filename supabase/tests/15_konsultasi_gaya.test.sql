begin;
\ir helpers.psql
select plan(7);

select tests.su();
insert into hair_consults (actor, status, result) values (tests.kasir(), 'success', '{"styles":["HS001"]}');

select tests.login(tests.andi());
select ok((select count(*) from hairstyles) > 0, 'kapster bisa membaca katalog');
select throws_like($$ insert into hairstyles (code, name) values ('HSX', 'X') $$, '%row-level security%', 'kapster tidak bisa mengubah katalog');
select is((select count(*) from hair_consults where actor <> auth.uid()), 0::bigint, 'kapster tidak melihat konsultasi milik orang lain');
select throws_like($$ select claim_hair_preview(gen_random_uuid(), 6) $$, '%permission denied%', 'kuota pratinjau hanya lewat server');
select throws_like($$ insert into hairstyles (code, name, face_shapes) values ('HSY', 'Y', '{segitiga}') $$, '%', 'nilai bentuk wajah dibatasi');

select tests.login(tests.mgr());
select lives_ok($$ insert into hairstyles (code, name, face_shapes) values ('HSZ', 'Uji', '{oval}') $$, 'manajer bisa menambah model');
select is((select count(*) from hair_consults where actor = tests.kasir()), 1::bigint, 'manajer melihat log konsultasi');

select * from finish();
rollback;
