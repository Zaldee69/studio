-- Foto halaman publik: slot Lashes (kartu lini ketiga) + foto lebih tajam (sisi terpanjang 2400 px → batas 5 MB).
alter table site_photos drop constraint site_photos_kind_check;
alter table site_photos add constraint site_photos_kind_check check (kind in ('hero', 'groom', 'bloom', 'lashes', 'gallery'));
update storage.buckets set file_size_limit = 5242880 where id = 'site';
