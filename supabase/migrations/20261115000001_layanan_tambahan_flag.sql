-- Pembeda layanan utama vs tambahan di kasir (owner 15 Nov). Hanya penanda tampilan; harga/komisi tak berubah.
alter table services add column is_addon boolean not null default false;
update services set is_addon = true
where name in ('Scalp Refresh', 'Masker Wajah', 'Hot Towel Shave', 'Rapikan Jenggot');
