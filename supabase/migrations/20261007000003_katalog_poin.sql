-- Poin singkat per model (3–4 bullet, mis. "Modern & rapi", "Samping tipis") untuk halaman katalog konsultasi.
alter table hairstyles add column highlights text[] not null default '{}';
