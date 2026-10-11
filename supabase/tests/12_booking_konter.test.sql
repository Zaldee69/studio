begin;
\ir helpers.psql
select plan(13);

create function tests.res(n text) returns uuid language sql security definer as $$ select id from public.resources where name = n $$;
create function tests.at(h text) returns timestamptz language sql as $$ select jkt(jkt_today() + 5, h::time) $$;
grant execute on all functions in schema tests to authenticated;
select tests.login(tests.kasir());

-- ---------- kategori: layanan, kursi/meja & staf satu kategori ----------
select throws_like($$ select create_booking_admin(tests.res('Kursi Barber 1'), tests.staff_sari(), tests.at('10:00'), array[tests.svc('Manicure Basic')]) $$,
                   '%Kursi/meja tidak sesuai layanan%', 'layanan nail di kursi barber ditolak');
select throws_like($$ select create_booking_admin(tests.res('Meja Manicure 1'), tests.staff_andi(), tests.at('10:00'), array[tests.svc('Manicure Basic')]) $$,
                   '%Staf tidak sesuai layanan%', 'kapster barber untuk layanan nail ditolak');
select throws_like($$ select create_booking_admin(tests.res('Kursi Barber 1'), tests.staff_andi(), tests.at('10:00'), array[tests.svc('Potong Rambut'), tests.svc('Manicure Basic')]) $$,
                   '%satu kategori%', 'barber + nail dalam satu booking ditolak (harus dua booking)');
select ok((create_booking_admin(tests.res('Meja Manicure 1'), tests.staff_sari(), tests.at('10:00'), array[tests.svc('Manicure Basic')]) ->> 'saved')::boolean,
          'nail di meja nail oleh nail artist → tersimpan');

-- ---------- no-show tidak memblokir kursi ----------
select tests.su();
update appointments set status = 'no_show' where resource_id = tests.res('Meja Manicure 1') and start_at = tests.at('10:00');
select tests.login(tests.kasir());
select ok((create_booking_admin(tests.res('Meja Manicure 1'), tests.staff_sari(), tests.at('10:00'), array[tests.svc('Manicure Basic')]) ->> 'saved')::boolean,
          'slot pelanggan "tidak datang" bisa dipakai walk-in tanpa bentrok');

-- ---------- jeda antar-booking ----------
select tests.su();
update settings set booking_buffer_minutes = 30;
select tests.login(tests.kasir());
select is((create_booking_admin(tests.res('Meja Manicure 1'), tests.staff_sari(), tests.at('11:00'), array[tests.svc('Manicure Basic')]) ->> 'saved')::boolean,
          false, 'jeda 30 mnt: tepat setelah booking lain → bentrok (perlu konfirmasi)');

-- ---------- No. WA tanpa nama ----------
select throws_like($$ select create_booking_admin(tests.res('Kursi Barber 2'), tests.staff_andi(), tests.at('15:00'), array[tests.svc('Potong Rambut')],
                        null, null, '081299998888') $$, '%Isi nama untuk pelanggan baru%', 'WA baru tanpa nama → minta nama');
select tests.su();
insert into customers (name, whatsapp) values ('Pak Budi', '6281299997777');
select tests.login(tests.kasir());
create temp table wa_only as select create_booking_admin(tests.res('Kursi Barber 2'), tests.staff_andi(), tests.at('16:00'), array[tests.svc('Potong Rambut')],
                         null, null, '081299997777') as r;
select tests.su();
select is((select c.name from customers c where c.id = (select (r ->> 'customer_id')::uuid from wa_only)), 'Pak Budi',
          'WA milik pelanggan lama tanpa nama → pakai pelanggan itu');
select tests.login(tests.kasir());
select ok((create_booking_admin(tests.res('Kursi Barber 3'), tests.staff_andi(), tests.at('18:00'), array[tests.svc('Potong Rambut')]) ->> 'saved')::boolean,
          'walk-in tanpa nama & WA tetap boleh');
-- buat dulu (\gset), baru dibaca: baris yang dibuat di dalam satu query belum terlihat oleh query itu sendiri
select create_booking_admin(tests.res('Kursi Barber 2'), tests.staff_andi(), tests.at('16:00'),
  array[tests.svc('Potong Rambut')], null, 'asdf', null, 'walk_in', p_force => true) ->> 'appointment_id' as a1 \gset
select is((select customer_id from appointments where id = :'a1'), null, 'nama tanpa WA → walk-in, tidak membuat data pelanggan');
select create_booking_admin(tests.res('Kursi Barber 2'), tests.staff_andi(), tests.at('17:00'),
  array[tests.svc('Potong Rambut')], p_source => 'walk_in', p_force => true, p_guest_name => '  Budi kaos merah ') ->> 'appointment_id' as a2 \gset
select is((select guest_name from appointments where id = :'a2'), 'Budi kaos merah', 'nama panggilan walk-in tersimpan di booking');
select create_booking_admin(tests.res('Kursi Barber 2'), tests.staff_andi(), tests.at('18:00'),
  array[tests.svc('Potong Rambut')], null, 'Tamu Baru', '0813-9999-1111', 'walk_in', p_force => true, p_guest_name => 'X') ->> 'appointment_id' as a3 \gset
select is((select guest_name from appointments where id = :'a3'), null, 'pelanggan ber-WA: nama panggilan diabaikan (pakai nama pelanggan)');
select isnt((select customer_id from appointments where id = :'a3'), null, 'pelanggan ber-WA tetap dibuatkan data pelanggan');

select * from finish();
rollback;
