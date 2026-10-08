-- Riwayat gaya per pelanggan: konsultasi terhubung ke booking/pelanggan (hasil lengkap disimpan sebagai teks),
-- catatan potongan yang benar-benar dilakukan (gaya, detail teknis, reaksi), dan pratinjau terpilih (opsional,
-- dengan persetujuan, bucket privat, kedaluwarsa 6 bulan). Pelanggan yang kembali → tanpa memanggil AI lagi.

alter table hair_consults add column appointment_id uuid references appointments (id) on delete set null;
create index hair_consults_customer_idx on hair_consults (customer_id, created_at desc) where customer_id is not null;

-- kapster melihat konsultasi pelanggan yang pernah ia layani (riwayat dari kapster lain ikut terlihat)
create policy staff_served_read on hair_consults for select to authenticated using (
  auth_role() = 'staff' and customer_id is not null and exists (
    select 1 from appointments a where a.customer_id = hair_consults.customer_id and a.staff_id = my_staff_id()));
create policy front_read on hair_consults for select to authenticated using (auth_role() = 'cashier');

create table hair_cut_records (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  appointment_id uuid references appointments (id) on delete set null,
  consult_id uuid references hair_consults (id) on delete set null,
  staff_id uuid references staff (id),
  hairstyle_id uuid references hairstyles (id) on delete set null,
  style_name text not null,                                   -- salinan nama (tetap terbaca bila katalog berubah)
  notes text not null default '',                             -- detail teknis: guard, tinggi fade, panjang atas
  reaction text not null default 'puas' check (reaction in ('puas', 'biasa', 'kurang')),
  preview_path text,                                          -- objek di bucket privat 'hair-previews'
  preview_expires_at timestamptz,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now()
);
create index hair_cut_records_customer_idx on hair_cut_records (customer_id, created_at desc);
alter table hair_cut_records enable row level security;
create policy front_read on hair_cut_records for select to authenticated using (auth_role() in ('manager', 'cashier'));
create policy staff_served_read on hair_cut_records for select to authenticated using (
  auth_role() = 'staff' and exists (
    select 1 from appointments a where a.customer_id = hair_cut_records.customer_id and a.staff_id = my_staff_id()));
create policy manager_delete on hair_cut_records for delete to authenticated using (auth_role() = 'manager');
-- insert lewat server (validasi konsultasi & persetujuan pratinjau); tanpa policy insert/update untuk klien
create trigger audit_hair_cut_records after delete on hair_cut_records for each row execute function audit_row();

-- Pratinjau tersimpan: privat, <customer_id>/<acak>.png. Ditulis server; dibaca lewat signed URL oleh tim yang berhak.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hair-previews', 'hair-previews', false, 5242880, array['image/png', 'image/jpeg', 'image/webp']);
create policy hair_previews_read on storage.objects for select to authenticated using (
  bucket_id = 'hair-previews' and (
    auth_role() in ('manager', 'cashier')
    or (auth_role() = 'staff' and exists (
      select 1 from appointments a where a.customer_id::text = (storage.foldername(name))[1] and a.staff_id = my_staff_id()))));
create policy hair_previews_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hair-previews' and auth_role() = 'manager');
