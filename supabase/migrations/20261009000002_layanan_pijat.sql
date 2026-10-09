-- Pijat: 2 bed, layanan sesuai pricelist D'Pras Massage, hanya lewat kasir/WA (tidak dibooking online),
-- tidak ikut diskon paket gabungan (checkout hanya menghitung barbershop + nail). Terapis ditambah manajer di SDM.

insert into resources (name, type, sort)
select v.name, 'massage', v.sort from (values ('Bed Pijat 1', 30), ('Bed Pijat 2', 31)) v(name, sort)
where not exists (select 1 from resources where type = 'massage');

insert into services (name, category, price, duration_min, online_bookable, public_description, sort)
select v.name, 'massage', v.price, v.dur, false, v.descr, v.sort from (values
  ('Pijat Fullbody', 80000, 60, 'Pijat seluruh badan untuk menghilangkan rasa lelah.', 1),
  ('Pijat Fullbody + Kop', 100000, 60, 'Pijat seluruh badan dan terapi kop (cupping kering) untuk relaksasi.', 2),
  ('Pijat Fullbody + Refleksi', 120000, 60, 'Pijat seluruh badan dan refleksi kaki.', 3),
  ('Pijat Keluhan', 100000, 60, 'Pijat terarah untuk keluhan seperti pegal, keseleo, atau sakit pinggang.', 4),
  ('Refleksi', 60000, 45, 'Pijat titik-titik pada kaki untuk kebugaran tubuh.', 5),
  ('Bekam (13 titik)', 80000, 45, 'Bekam dengan 13 titik.', 6),
  ('Tambahan 1 titik bekam', 6000, 2, 'Tambahan per titik di luar 13 titik bekam.', 7),
  ('Totok Wajah', 50000, 30, 'Totok wajah untuk relaksasi dan meredakan pegal di kepala.', 8),
  ('Ear Candle', 40000, 30, 'Membersihkan telinga dengan lilin.', 9),
  ('Paket Bekam + Pijat + Refleksi', 200000, 90, 'Paket spesial bekam, pijat fullbody, dan refleksi.', 10)
) v(name, price, dur, descr, sort)
where not exists (select 1 from services where category = 'massage');

-- Rincian per kategori di analitik & laporan owner: tambahkan 'massage' di samping 'nail'.
do $$
declare
  fn text; def text; old text;
  patches text[][] := array[
    array['kpi_revenue_mix', $a$array['barbershop', 'nail', 'retail']$a$, $a$array['barbershop', 'nail', 'massage', 'retail']$a$],
    array['kpi_revenue_mix', $a$category in ('barbershop', 'nail', 'retail')$a$, $a$category in ('barbershop', 'nail', 'massage', 'retail')$a$],
    array['kpi_revenue_mix', $a$filter (where category = 'nail'), 0)::bigint as nail,$a$,
          $a$filter (where category = 'nail'), 0)::bigint as nail, coalesce(sum(revenue_net) filter (where category = 'massage'), 0)::bigint as massage,$a$],
    array['owner_finance', $a$array['barbershop', 'nail', 'retail']$a$, $a$array['barbershop', 'nail', 'massage', 'retail']$a$],
    array['owner_daily', $a$cat = 'nail'),$a$, $a$cat = 'nail'), 'massage', (select coalesce(sum(net_amount), 0) from it where it.day = d.day and cat = 'massage'),$a$],
    array['kpi_period', $a$'rev_nail', coalesce((select rev from c where category = 'nail'), 0),$a$,
          $a$'rev_nail', coalesce((select rev from c where category = 'nail'), 0), 'rev_massage', coalesce((select rev from c where category = 'massage'), 0),$a$],
    array['owner_summary', $a$'rev_nail', k -> 'rev_nail',$a$, $a$'rev_nail', k -> 'rev_nail', 'rev_massage', k -> 'rev_massage',$a$]
  ];
  i int;
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % #% tidak menemukan teks', fn, i; end if;
    execute def;
  end loop;
end $$;

-- Staf pada item layanan harus sekategori (komisi pijat tidak bisa jatuh ke kapster, nail ke kapster, dst.).
create or replace function check_item_staff() returns trigger language plpgsql set search_path = public as $$
declare booked uuid;
begin
  if new.category = 'retail' then return new; end if;
  if new.staff_id is not null and not exists (select 1 from staff where id = new.staff_id and category::text = new.category::text) then
    raise exception 'Layanan "%" harus dicatat atas nama staf kategori yang sama.', new.name;
  end if;
  if new.appointment_id is null then return new; end if;
  select staff_id into booked from appointments where id = new.appointment_id;
  if booked is not null and new.staff_id is distinct from booked then
    raise exception 'Kapster/nail artist "%" berbeda dengan booking. Bila memang diganti, ubah booking dulu (tercatat).', new.name;
  end if;
  return new;
end $$;
