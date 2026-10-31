begin;
\ir helpers.psql
select plan(4);

-- Audit BOOK-7 (1 Nov): walk-in dibuat dalam satu transaksi (booking + tanda giliran + status).
select tests.login(tests.kasir());
select start_walk_in((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-07-01', '10:00'),
  array[tests.svc('Potong Rambut')], p_guest_name => 'Walk-in Uji', p_force => true, p_requested => true) ->> 'appointment_id' as a1 \gset
select start_walk_in((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), jkt('2030-07-01', '11:00'),
  array[tests.svc('Potong Rambut')], p_guest_name => 'Antre Uji', p_queue => true) ->> 'appointment_id' as a2 \gset
select tests.su();
select results_eq(format($$ select status::text, source::text, requested_staff from appointments where id = '%s' $$, :'a1'),
  $$ values ('in_service', 'walk_in', true) $$, 'langsung: Dilayani + tanda diminta pelanggan');
select results_eq(format($$ select status::text, arrived_at is not null from appointments where id = '%s' $$, :'a2'),
  $$ values ('arrived', true) $$, 'antre: Datang + jam datang tercatat');
select tests.login(tests.andi());
select throws_like($$ select start_walk_in((select id from resources where name = 'Kursi Barber 1'), tests.staff_andi(), now(), array[tests.svc('Potong Rambut')]) $$,
  '%Akses ditolak%', 'capster tidak bisa membuat walk-in');
select tests.su();
select ok(not has_function_privilege('anon', 'start_walk_in(uuid,uuid,timestamptz,uuid[],uuid,text,boolean,boolean,boolean)'::regprocedure, 'EXECUTE'), 'anon tidak bisa memanggil');

select * from finish();
rollback;
