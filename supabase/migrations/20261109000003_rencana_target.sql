-- Rencana & Target manajer (rapat 9 Nov): tugas utama 4 minggu = menaikkan jumlah pelanggan.
--  1. Target mingguan di settings (diubah di Analitik → Target KPI, satu rumah dengan target lain):
--     potong per minggu (69 = titik impas 3 capster), pelanggan kembali per minggu, pelanggan baru per minggu (0 = tanpa target).
--  2. weekly_progress(minggu): potong, pelanggan baru/kembali, sumber pelanggan baru, % transaksi ber-WA — dihitung dari transaksi,
--     bukan diisi tangan. "Pelanggan baru" = transaksi pertamanya jatuh di minggu itu (keputusan 31 Okt); "kembali" = sudah pernah
--     bertransaksi sebelum minggu itu. "Potong" = services.is_cut (satu definisi, 20261101000021).
--  3. Sumber pelanggan baru ditambah 'perumahan' (brosur, grup warga) dan 'iklan' (iklan IG/FB) supaya hasil kedua jalan itu terukur.
--  4. manager_tasks + manager_task_log: daftar tugas manajer dengan penanggung jawab, tenggat, ukuran berhasil, status, catatan bukti.
--     Tugas tidak bisa dihapus, hanya dibatalkan; setiap perubahan tercatat otomatis (trigger) dengan siapa dan kapan → bisa
--     dipertanggungjawabkan. Isi awal = 34 tugas rencana 10 Nov–6 Des (tracker Artifact 1cGEZ3fV, revisi manajer 9 Nov).

alter table customers drop constraint customers_source_check;
alter table customers add constraint customers_source_check
  check (source in ('instagram', 'google_maps', 'whatsapp', 'teman', 'lewat', 'web', 'perumahan', 'iklan', 'lainnya'));

alter table settings
  add column target_cuts_weekly int not null default 69 check (target_cuts_weekly between 0 and 1000),
  add column target_returning_weekly int not null default 6 check (target_returning_weekly between 0 and 1000),
  add column target_new_weekly int not null default 0 check (target_new_weekly between 0 and 1000);
comment on column settings.target_cuts_weekly is 'Target potong per minggu Senin–Minggu (halaman Rencana & Target).';
comment on column settings.target_returning_weekly is 'Target pelanggan yang datang lagi per minggu.';
comment on column settings.target_new_weekly is 'Target pelanggan baru per minggu; 0 = tanpa target.';

create function weekly_progress(p_day date default jkt_today()) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare w0 date := date_trunc('week', p_day)::date; r jsonb;
begin
  perform require_role('manager');
  with tx as (
    select t.id, t.customer_id, t.created_at from transactions t
    where t.voided_at is null and t.created_at >= jkt(w0, '00:00') and t.created_at < jkt(w0 + 7, '00:00')),
  cuts as (
    select (tx.created_at at time zone 'Asia/Jakarta')::date as d, count(*) as n
    from tx join transaction_items ti on ti.transaction_id = tx.id join services sv on sv.id = ti.service_id
    where sv.is_cut group by 1),
  firsts as (
    select customer_id, min(created_at) as first_at from transactions
    where voided_at is null and customer_id is not null group by 1),
  cust as (
    select distinct tx.customer_id, f.first_at >= jkt(w0, '00:00') as is_new
    from tx join firsts f on f.customer_id = tx.customer_id)
  select jsonb_build_object(
    'week', w0,
    'cuts', coalesce((select sum(n) from cuts), 0),
    'cuts_by_day', coalesce((select jsonb_object_agg(d, n) from cuts), '{}'),
    'tx', (select count(*) from tx),
    'tx_with_wa', (select count(*) from tx join customers c on c.id = tx.customer_id where c.whatsapp is not null),
    'new', (select count(*) from cust where is_new),
    'returning', (select count(*) from cust where not is_new),
    'new_by_source', coalesce((select jsonb_object_agg(src, n) from (
        select coalesce(c.source, 'tidak_tercatat') as src, count(*) as n
        from cust join customers c on c.id = cust.customer_id where cust.is_new group by 1) z), '{}'),
    'target', (select jsonb_build_object('cuts', s.target_cuts_weekly, 'returning', s.target_returning_weekly, 'new', s.target_new_weekly)
               from settings s))
  into r;
  return r;
end $$;
revoke execute on function weekly_progress(date) from public, anon;
grant execute on function weekly_progress(date) to authenticated;

-- ---------- Daftar tugas manajer ----------
create table manager_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  pic text not null default 'Manajer' check (length(trim(pic)) > 0),
  due date not null,
  measure text not null default '',
  status text not null default 'belum' check (status in ('belum', 'jalan', 'selesai', 'batal')),
  note text not null default '',
  grows_customers boolean not null default false,
  created_by uuid references profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_by uuid references profiles (id) default auth.uid(),
  updated_at timestamptz not null default now()
);
comment on table manager_tasks is 'Tugas rencana manajer. Tidak bisa dihapus (dibatalkan saja); riwayat di manager_task_log.';
comment on column manager_tasks.grows_customers is 'Tugas yang langsung menambah pelanggan (tanda "Menambah pelanggan").';
create index manager_tasks_due_idx on manager_tasks (due);

create table manager_task_log (
  id bigint generated always as identity primary key,
  task_id uuid not null references manager_tasks (id),
  at timestamptz not null default now(),
  by uuid references profiles (id),
  kind text not null check (kind in ('dibuat', 'status', 'catatan', 'diubah')),
  from_value text,
  to_value text
);
create index manager_task_log_at_idx on manager_task_log (at desc);

alter table manager_tasks enable row level security;
alter table manager_task_log enable row level security;
create policy manager_all on manager_tasks for select to authenticated using (auth_role() = 'manager');
create policy manager_insert on manager_tasks for insert to authenticated with check (auth_role() = 'manager');
create policy manager_update on manager_tasks for update to authenticated using (auth_role() = 'manager') with check (auth_role() = 'manager');
create policy manager_read on manager_task_log for select to authenticated using (auth_role() = 'manager');
-- tanpa policy delete: tugas & riwayat tidak bisa dihapus dari aplikasi

-- siapa & kapan diisi database, bukan klien (tidak bisa dipalsukan)
create function manager_tasks_stamp() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then new.created_by := auth.uid(); new.created_at := now(); end if;
  if tg_op = 'UPDATE' then new.created_by := old.created_by; new.created_at := old.created_at; end if;
  new.updated_by := auth.uid(); new.updated_at := now();
  return new;
end $$;
create trigger manager_tasks_stamp before insert or update on manager_tasks for each row execute function manager_tasks_stamp();

create function manager_tasks_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into manager_task_log (task_id, by, kind, to_value) values (new.id, auth.uid(), 'dibuat', new.title);
    return new;
  end if;
  if new.status is distinct from old.status then
    insert into manager_task_log (task_id, by, kind, from_value, to_value) values (new.id, auth.uid(), 'status', old.status, new.status);
  end if;
  if new.note is distinct from old.note then
    insert into manager_task_log (task_id, by, kind, from_value, to_value) values (new.id, auth.uid(), 'catatan', old.note, new.note);
  end if;
  if (new.title, new.pic, new.due, new.measure, new.grows_customers) is distinct from (old.title, old.pic, old.due, old.measure, old.grows_customers) then
    insert into manager_task_log (task_id, by, kind, from_value, to_value) values (new.id, auth.uid(), 'diubah',
      concat_ws(' · ', old.title, old.pic, old.due, old.measure), concat_ws(' · ', new.title, new.pic, new.due, new.measure));
  end if;
  return new;
end $$;
create trigger manager_tasks_log after insert or update on manager_tasks for each row execute function manager_tasks_log();

alter publication supabase_realtime add table manager_tasks, manager_task_log;

-- Isi awal: rencana 10 Nov–6 Des (dibuat oleh sistem; riwayat "dibuat" tanpa nama)
insert into manager_tasks (title, pic, due, measure, grows_customers) values
  ('Rapikan uang: kasbon Rohman Rp100 rb diberi nama, tips Rp50 rb dikembalikan ke staf, uang laci disetor dan disisakan Rp500 rb', 'Manajer bersama Rohman', date '2026-11-10', '0 kasbon tanpa nama; saldo laci di bawah Rp1 jt setiap tutup kas', false),
  ('Jam buka 10.00–21.00 diganti di aplikasi, Google Maps, bio IG, dan web', 'Manajer', date '2026-11-10', '4 dari 4 tempat sudah berubah', false),
  ('Matikan voucher SENKAMWA di Pengaturan → Voucher', 'Manajer', date '2026-11-10', 'voucher berstatus nonaktif', false),
  ('Tes potong Dirga (calon capster) 1 kepala; kalau lolos, PKWT ditandatangani sebelum mulai kerja', 'Manajer', date '2026-11-10', 'hasil potong rapi dan sesuai permintaan model, selesai ≤35 menit; PKWT ditandatangani', false),
  ('PKWT Dwi ditandatangani di hari pertama', 'Manajer', date '2026-11-11', 'ditandatangani Dwi dan studio', false),
  ('Hitung ulang stok, dicatat sebagai penyesuaian (bukan pembelian); beli pisau dan sampo lewat Terima stok', 'Manajer bersama Dwi', date '2026-11-11', '0 bahan dengan stok minus pada Minggu 15 Nov', false),
  ('Isi link ulasan Google di Pengaturan; kasir meminta ulasan saat pelanggan membayar', 'Manajer dan kasir', date '2026-11-11', '≥3 ulasan Google baru per minggu, ≥10 sampai 6 Des', true),
  ('Latih Dwi: catat nama, No. WA, dan sumber pelanggan (lewat, teman, perumahan, iklan, Maps), kasbon pakai nama staf, tips dicatat terpisah, setor laci', 'Manajer', date '2026-11-11', 'No. WA tercatat ≥80% di shift Dwi', false),
  ('WA personal ke kontak lama yang belum pernah datang (186 nomor dari HP owner): 20 nomor per hari Senin–Kamis, satu per satu, tawarkan "kami bookingkan" untuk Senin–Kamis', 'Manajer', date '2026-11-12', '≥4 kontak datang per minggu; ≥15% membalas', true),
  ('Kasir mulai menawarkan Fresh sekali kepada pelanggan Essential, tanpa diskon', 'Rohman dan Dwi, diawasi manajer', date '2026-11-12', 'porsi Fresh ke atas ≥33%', false),
  ('Kasir menawarkan jadwal kunjungan berikutnya saat pelanggan membayar (diarahkan ke Senin–Kamis), dicatat sebagai booking', 'Rohman dan Dwi, diawasi manajer', date '2026-11-12', '≥20% pelanggan mengambil jadwal berikutnya', true),
  ('Lengkapi Google Maps: ≥10 foto studio dan hasil potong, daftar harga, jam buka, nomor WA', 'Manajer', date '2026-11-13', 'profil Maps lengkap; tampil saat dicari "barbershop Cimanggis"', true),
  ('Minta angka sewa ruko ke owner untuk laporan laba', 'Manajer (angka dari owner)', date '2026-11-14', 'angka sewa per bulan tercatat', false),
  ('Cari calon capster ketiga dan jadwalkan tes potong', 'Manajer', date '2026-11-14', 'minimal 1 calon dengan jadwal tes', false),
  ('Kumpulkan grup WA warga dan kontak pengelola/satpam Cimanggis Golf Estate dan 2 perumahan terdekat', 'Manajer', date '2026-11-14', '≥3 grup atau kontak yang bersedia menyebarkan info', true),
  ('Rilis aplikasi: absen staf, Kartu Potong, kabar giliran WA akhir pekan', 'Manajer', date '2026-11-16', 'absen tercatat ≥95% di minggu pertama', false),
  ('WA personal ke kontak lama gelombang 2 (lanjutan 186 nomor), 20 per hari Senin–Kamis', 'Manajer', date '2026-11-16', '≥4 kontak datang per minggu', true),
  ('Siapkan iklan Meta (IG/FB) radius ±3 km, Rp750 rb untuk 2 minggu, tayang Senin–Kamis 09.00–16.00 mulai Kamis 19 Nov dengan pesan "siang hari kerja langsung dilayani"; kasir mencatat sumber "iklan"', 'Manajer (dana dari owner)', date '2026-11-16', 'iklan tayang 19 Nov; ≥8 pelanggan baru dari iklan per minggu', true),
  ('Cetak brosur atau kartu kecil (≤Rp300 rb) berisi "Senin–Kamis siang langsung dilayani", titip ke pos satpam dan pengelola, kirim ke grup WA warga', 'Manajer', date '2026-11-18', '≥5 pelanggan per minggu bersumber perumahan mulai minggu 3', true),
  ('Dirga mulai kerja (bila lolos tes); aturan giliran walk-in ditulis dan ditempel (yang tidak meminta capster tertentu masuk giliran)', 'Manajer', date '2026-11-19', 'aturan tertempel; tanda "diminta pelanggan" terisi ≥95%', false),
  ('Titip brosur "Kids Cut pulang sekolah, Senin–Kamis 14.00–17.00" ke 2 sekolah/TK terdekat dan masjid perumahan', 'Manajer', date '2026-11-19', '≥3 Kids Cut Senin–Kamis per minggu', true),
  ('Papan kecil di pintu: "Senin–Kamis langsung dilayani" (biaya ≤Rp30 rb)', 'Manajer', date '2026-11-20', 'terpasang; potong Sen–Kam ≥5,5 per hari', true),
  ('Tes potong calon capster ketiga 1 kepala; kalau lolos, PKWT ditandatangani sebelum mulai kerja', 'Manajer', date '2026-11-21', 'hasil potong rapi dan sesuai permintaan model, selesai ≤35 menit; PKWT ditandatangani', false),
  ('WA personal ke pelanggan yang datang 26 Okt–8 Nov (±60 orang, mulai jatuh tempo potong ulang), Senin 23 dan Kamis 26 Nov', 'Manajer', date '2026-11-23', '≥8 pelanggan lama kembali minggu ini', true),
  ('Evaluasi iklan Meta: lanjutkan, ubah, atau hentikan', 'Manajer', date '2026-11-26', 'biaya per pelanggan baru dari iklan ≤Rp25 rb; kalau lebih, iklan diubah atau dihentikan', true),
  ('Evaluasi tertulis capster baru: waktu potong, komplain, kehadiran', 'Manajer', date '2026-11-27', 'evaluasi ditandatangani; waktu potong ≤35 menit, komplain ≤1', false),
  ('Kalau capster baru lolos evaluasi: satu posting perkenalan tanpa diskon, foto dengan izinnya', 'Manajer', date '2026-11-28', 'terposting', true),
  ('Capster ketiga mulai kerja; jadwal shift dan giliran walk-in dibagi untuk 3 capster', 'Manajer', date '2026-11-30', '3 capster aktif di jadwal; tunggu akhir pekan ≤15 menit', false),
  ('Tutup buku November dengan laba lengkap (sewa, kasir, capster) dan kirim ke owner', 'Manajer', date '2026-11-30', 'laporan terkirim ke owner', false),
  ('Slip bayaran 4 minggu dibagikan ke setiap staf', 'Manajer', date '2026-11-30', 'slip diterima 6 dari 6 staf', false),
  ('WA personal ke pelanggan yang 3–4 minggu belum potong, Senin 30 Nov dan Kamis 3 Des', 'Manajer', date '2026-11-30', '≥10 pelanggan lama kembali minggu ini', true),
  ('Senin pagi: cek progres minggu lalu di Rencana & Target; kalau potong di bawah jalur, tambah 20 WA personal minggu ini', 'Manajer', date '2026-11-16', 'progres dicek dan tindakan tambahan dicatat di catatan', true),
  ('Senin pagi: cek progres minggu lalu di Rencana & Target; kalau potong di bawah jalur, tambah 20 WA personal minggu ini', 'Manajer', date '2026-11-23', 'progres dicek dan tindakan tambahan dicatat di catatan', true),
  ('Senin pagi: cek progres minggu lalu di Rencana & Target; kalau potong di bawah jalur, tambah 20 WA personal minggu ini', 'Manajer', date '2026-11-30', 'progres dicek dan tindakan tambahan dicatat di catatan', true);
