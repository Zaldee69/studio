-- Konsultasi gaya rambut: kapster memotret pelanggan → rekomendasi dari katalog + pratinjau "pelanggan dengan gaya X".
-- Katalog & foto referensi dikelola manajer. Foto pelanggan TIDAK disimpan; yang dicatat hanya hasil (analisis & id gaya)
-- untuk batas pemakaian & audit.

create table hairstyles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                       -- mis. HS001 (dipakai model sebagai hair_style_id)
  name text not null,
  category text not null default 'Short',          -- Short / Medium / Long / ...
  description text not null default '',
  face_shapes text[] not null default '{}'
    check (face_shapes <@ array['oval', 'round', 'square', 'oblong', 'heart', 'diamond']),
  hair_types text[] not null default '{}'
    check (hair_types <@ array['straight', 'slightly_wavy', 'wavy', 'curly']),
  hair_density text[] not null default '{}' check (hair_density <@ array['thin', 'medium', 'thick']),
  suitable_lengths text[] not null default '{}' check (suitable_lengths <@ array['very_short', 'short', 'medium', 'long']),
  maintenance_level text not null default 'medium' check (maintenance_level in ('low', 'medium', 'high')),
  style_character text[] not null default '{}',     -- bebas: modern, clean, classic, natural, ...
  cut_notes text not null default '',               -- catatan teknis (guard, fade) — boleh dikutip di catatan kapster
  active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table hairstyle_images (
  id uuid primary key default gen_random_uuid(),
  hairstyle_id uuid not null references hairstyles (id) on delete cascade,
  view text not null default 'front' check (view in ('front', 'side', 'back', 'other')),
  path text not null,                               -- objek di bucket 'hairstyles'
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index hairstyle_images_style_idx on hairstyle_images (hairstyle_id, sort);

alter table hairstyles enable row level security;
alter table hairstyle_images enable row level security;
create policy team_read on hairstyles for select to authenticated using (auth_role() in ('manager', 'cashier', 'staff'));
create policy manager_write on hairstyles for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
create policy team_read on hairstyle_images for select to authenticated using (auth_role() in ('manager', 'cashier', 'staff'));
create policy manager_write on hairstyle_images for all to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
create trigger audit_hairstyles after update or delete on hairstyles for each row execute function audit_row();

-- Foto referensi katalog (bukan foto pelanggan) → publik agar mudah ditampilkan.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('hairstyles', 'hairstyles', true, 2097152, array['image/jpeg', 'image/png', 'image/webp']);
create policy hairstyles_manager_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'hairstyles' and auth_role() = 'manager');
create policy hairstyles_manager_update on storage.objects for update to authenticated
  using (bucket_id = 'hairstyles' and auth_role() = 'manager');
create policy hairstyles_manager_delete on storage.objects for delete to authenticated
  using (bucket_id = 'hairstyles' and auth_role() = 'manager');

-- Log konsultasi (tanpa foto). Ditulis server (kunci rahasia) setelah memverifikasi peran pengguna.
create table hair_consults (
  id uuid primary key default gen_random_uuid(),
  actor uuid not null references profiles (id),
  customer_id uuid references customers (id) on delete set null,
  status text not null,                             -- success | insufficient_photo | no_match | error
  result jsonb not null default '{}',               -- analisis + id gaya yang direkomendasikan
  previews_used int not null default 0,
  created_at timestamptz not null default now()
);
create index hair_consults_actor_idx on hair_consults (actor, created_at desc);
alter table hair_consults enable row level security;
create policy own_or_manager_read on hair_consults for select to authenticated
  using (actor = auth.uid() or auth_role() = 'manager');

-- Kuota pratinjau atomik (permintaan paralel aman). Hanya untuk server (kunci rahasia).
create function claim_hair_preview(p_id uuid, p_max int) returns boolean language sql security definer set search_path = public as $$
  with u as (update hair_consults set previews_used = previews_used + 1 where id = p_id and previews_used < p_max returning 1)
  select exists (select 1 from u)
$$;
revoke execute on function claim_hair_preview(uuid, int) from public, anon, authenticated;
