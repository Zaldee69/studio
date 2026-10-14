-- Rilis harga (switch): harga & layanan baru disiapkan dulu, berlaku serentak saat manajer menekan "Rilis harga baru".
--   services.next_price      — harga berikutnya (kosong = tidak berubah)
--   services.release_action  — 'launch' (layanan baru, aktif saat rilis) | 'retire' (dinonaktifkan saat rilis)
-- Selama belum rilis: kasir, booking online & halaman publik tidak berubah (layanan draft tidak aktif).
-- Transaksi menyimpan harganya sendiri → transaksi lama tidak berubah; booking lama tetap bisa dibayar (kasir memilih layanan).
alter table services add column next_price bigint check (next_price > 0),
  add column release_action text check (release_action in ('launch', 'retire'));

create table price_releases (
  id uuid primary key default gen_random_uuid(),
  released_at timestamptz not null default now(),
  released_by uuid default auth.uid(),
  changes jsonb not null -- [{id, name, action, price_before, price_after, active_before, active_after}]
);
alter table price_releases enable row level security;
create policy manager_read on price_releases for select to authenticated using (auth_role() = 'manager');

create function release_prices() returns jsonb language plpgsql security definer set search_path = public as $$
declare ch jsonb;
begin
  perform require_role('manager');
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', name,
           'action', coalesce(release_action, 'price'), 'price_before', price, 'price_after', coalesce(next_price, price),
           'active_before', active, 'active_after', case release_action when 'launch' then true when 'retire' then false else active end)
         order by sort, name), '[]')
  into ch from services where next_price is not null or release_action is not null;
  if jsonb_array_length(ch) = 0 then raise exception 'Tidak ada perubahan harga yang disiapkan'; end if;
  update services set price = coalesce(next_price, price),
    active = case release_action when 'launch' then true when 'retire' then false else active end,
    next_price = null, release_action = null
  where next_price is not null or release_action is not null;
  insert into price_releases (changes) values (ch);
  return jsonb_build_object('changed', jsonb_array_length(ch));
end $$;
revoke execute on function release_prices() from public, anon;

-- Draft pricelist barbershop 2026 (belum aktif; berlaku saat dirilis)
insert into services (name, category, price, duration_min, active, online_bookable, release_action, public_description, sort)
select v.name, 'barbershop', v.price, v.dur, false, v.online, 'launch', v.descr, v.sort
from (values
  ('Essential Cut', 45000, 25, true, 'Potong rambut · rapikan garis leher.', 1),
  ('Fresh Groom', 60000, 40, true, 'Potong rambut · keramas · hair tonic · styling · handuk hangat.', 2),
  ('Relax Groom', 80000, 50, true, 'Semua di Fresh Groom · pijat kepala, bahu & punggung atas 10 menit.', 3),
  ('Signature Groom', 100000, 65, true, 'Semua di Relax Groom · face mask · cukur jenggot/kumis.', 4),
  ('Kids Cut', 35000, 25, true, 'Potong rambut anak (≤12 tahun) · styling.', 5),
  ('Hair tonic & scalp treatment', 15000, 10, false, 'Tambahan: hair tonic & pijat kulit kepala.', 7),
  ('Face mask', 20000, 15, false, 'Tambahan: masker wajah.', 8),
  ('Hot towel shave', 25000, 20, false, 'Tambahan: cukur dengan handuk hangat.', 9)
) as v(name, price, dur, online, descr, sort)
where not exists (select 1 from services s where s.name = v.name);
update services set release_action = 'retire' where name = 'Potong Rambut' and active;
-- saran upsell kasir: naik satu tingkat
update services s set upsell_service_id = (select id from services where name = u.next)
from (values ('Essential Cut', 'Fresh Groom'), ('Fresh Groom', 'Relax Groom'), ('Relax Groom', 'Signature Groom')) as u(cur, next)
where s.name = u.cur;
