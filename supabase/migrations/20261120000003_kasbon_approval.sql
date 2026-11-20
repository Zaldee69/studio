-- Kasbon lewat pengajuan: owner setuju, owner transfer + unggah bukti, baru jadi expenses (spec T-8c19ecda + review arsitektur).
-- Aditif. Perilaku lama TIDAK berubah selama settings.kasbon_flow_on = false (default). Rollback: set flag false.
-- ponytail: settings.kasbon_approver sengaja TIDAK diisi di sini (tanpa data pribadi); owner/DBA mengisinya manual
--   sekali (update settings set kasbon_approver = '<id profil owner>'). Selama NULL, decide/pay fail-closed.
-- ponytail: dobel potong payroll_adjustments vs commission_week_pays (warisan) TIDAK diperbaiki di sini; lihat supabase/rekonsiliasi-kasbon.sql.

-- ---------- settings ----------
alter table settings
  add column kasbon_weekly_limit bigint not null default 200000 check (kasbon_weekly_limit >= 0),   -- 0 = blokir (kecuali override owner)
  add column kasbon_approver uuid references profiles (id) on delete set null,
  add column kasbon_flow_on boolean not null default false;

-- B1: policy manager_all mengizinkan SEMUA manajer ubah settings → kunci tiga kolom ini ke approver saja.
-- auth.uid() null (migrasi/service role) lolos = jalur bootstrap. Approver NULL = tak ada user biasa yang boleh ubah.
create function settings_kasbon_guard() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.kasbon_approver, new.kasbon_weekly_limit, new.kasbon_flow_on)
       is distinct from (old.kasbon_approver, old.kasbon_weekly_limit, old.kasbon_flow_on)
     and auth.uid() is not null and auth.uid() is distinct from old.kasbon_approver then
    raise exception 'Pengaturan kasbon hanya bisa diubah owner' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger settings_kasbon_guard before update on settings for each row execute function settings_kasbon_guard();

-- ---------- kasbon_requests ----------
create table kasbon_requests (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references staff (id),
  amount bigint not null check (amount > 0 and amount <= 1000000000),
  reason text not null check (length(trim(reason)) >= 2 and length(reason) <= 200),
  status text not null default 'diajukan' check (status in ('diajukan', 'disetujui', 'dibayar', 'ditolak', 'dibatalkan')),
  week_start date not null,                                   -- Senin WIB minggu pengajuan
  over_limit boolean not null default false,
  limit_override boolean not null default false,
  override_by uuid references profiles (id) on delete set null,
  requested_by uuid references profiles (id) on delete set null default auth.uid(),
  requested_at timestamptz not null default now(),
  decided_by uuid references profiles (id) on delete set null,
  decided_at timestamptz,
  decision_note text,
  paid_by uuid references profiles (id) on delete set null,
  paid_at timestamptz,
  proof_path text,
  expense_id uuid references expenses (id),
  cancelled_by uuid references profiles (id) on delete set null,
  cancelled_at timestamptz,
  cancel_reason text,
  constraint kasbon_dibayar_lengkap check (status <> 'dibayar' or (proof_path is not null and expense_id is not null and paid_by is not null and paid_at is not null)),
  constraint kasbon_tolak_alasan check (status <> 'ditolak' or (length(trim(coalesce(decision_note, ''))) > 0 and decided_by is not null)),
  constraint kasbon_putusan check (status not in ('disetujui', 'dibayar') or decided_by is not null),
  constraint kasbon_batal_alasan check (status <> 'dibatalkan' or length(trim(coalesce(cancel_reason, ''))) > 0)
);
create unique index kasbon_requests_expense on kasbon_requests (expense_id) where expense_id is not null;
create index kasbon_requests_staff_week on kasbon_requests (staff_id, week_start);
create index kasbon_requests_status on kasbon_requests (status, requested_at);

alter table kasbon_requests enable row level security;
revoke all on kasbon_requests from anon, authenticated;
grant select on kasbon_requests to authenticated;
create policy kasbon_manager_read on kasbon_requests for select to authenticated using (auth_role() = 'manager');
create policy kasbon_cashier_own  on kasbon_requests for select to authenticated using (auth_role() = 'cashier' and requested_by = auth.uid());
create policy kasbon_staff_own    on kasbon_requests for select to authenticated using (auth_role() = 'staff' and staff_id = my_staff_id());
create trigger audit_kasbon_requests after insert or update on kasbon_requests for each row execute function audit_row();
alter publication supabase_realtime add table kasbon_requests;

-- ---------- helper ----------
-- Pemakaian limit minggu (Senin–Minggu WIB) per staf. Dibayar yang sudah di-void tidak dihitung (B3).
create function kasbon_week_used(p_staff uuid, p_week date, p_except uuid default null, p_committed boolean default false) returns bigint
language sql stable security definer set search_path = public as $$
  select coalesce(sum(r.amount), 0)::bigint
  from kasbon_requests r left join expenses e on e.id = r.expense_id
  where r.staff_id = p_staff and r.week_start = p_week and r.id is distinct from p_except
    and (not p_committed or r.status <> 'diajukan')   -- saat putusan: yang antre belum mengikat
    and (r.status in ('diajukan', 'disetujui') or (r.status = 'dibayar' and e.voided_at is null))
$$;
revoke execute on function kasbon_week_used(uuid, date, uuid, boolean) from public, anon, authenticated;

create function kasbon_is_approver() returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and auth.uid() = (select kasbon_approver from settings)
$$;
grant execute on function kasbon_is_approver() to authenticated;
revoke execute on function kasbon_is_approver() from public, anon;

-- ---------- RPC ----------
create function kasbon_request(p_staff uuid, p_amount bigint, p_reason text) returns uuid
language plpgsql security definer set search_path = public as $$
declare st settings; w date := date_trunc('week', jkt_today())::date; used bigint; id uuid; who text; over boolean;
begin
  perform require_role('manager', 'cashier');
  select * into st from settings;
  if not st.kasbon_flow_on then raise exception 'Alur kasbon baru belum aktif'; end if;
  if coalesce(p_amount, 0) <= 0 then raise exception 'Jumlah kasbon harus lebih dari 0'; end if;
  if length(trim(coalesce(p_reason, ''))) < 2 then raise exception 'Alasan kasbon wajib diisi'; end if;
  select name into who from staff where staff.id = p_staff and active for update;   -- kunci staf: hitung limit tak balapan
  if who is null then raise exception 'Pilih staf aktif untuk kasbon'; end if;
  if exists (select 1 from payroll_periods where month = date_trunc('month', jkt_today())::date and status = 'closed') then
    raise exception 'Gaji bulan % sudah ditutup — kasbon tidak bisa dipotong', to_char(jkt_today(), 'MM/YYYY');
  end if;
  used := kasbon_week_used(p_staff, w);
  over := used + p_amount > st.kasbon_weekly_limit;      -- B2: tidak diblokir di sini, owner boleh override saat putuskan
  insert into kasbon_requests (staff_id, amount, reason, week_start, over_limit)
  values (p_staff, p_amount, trim(p_reason), w, over) returning kasbon_requests.id into id;
  if st.kasbon_approver is not null then
    begin
      insert into notifications (target_role, target_user, kind, payload)
      values ('manager', st.kasbon_approver, 'kasbon_request', jsonb_build_object('request_id', id, 'staff', who, 'amount', p_amount, 'over_limit', over));
    exception when others then raise warning 'notifikasi kasbon gagal: %', sqlerrm; end;
  end if;
  perform safe_alert(format(E'💸 Pengajuan kasbon %s: %s%s\nAlasan: %s\nDiajukan oleh: %s\nSetujui di Kasbon.',
    who, fmt_rp(p_amount), case when over then ' (MELEBIHI limit minggu ini)' else '' end, trim(p_reason), actor_name()));
  return id;
end $$;

create function kasbon_decide(p_id uuid, p_approve boolean, p_note text default null, p_override boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare r kasbon_requests; st settings; used bigint; who text;
begin
  perform require_role('manager');
  if not kasbon_is_approver() then raise exception 'Hanya owner yang bisa memutuskan kasbon' using errcode = '42501'; end if;
  select * into r from kasbon_requests where kasbon_requests.id = p_id for update;
  if not found or r.status <> 'diajukan' then raise exception 'Pengajuan tidak ditemukan atau sudah diputuskan'; end if;
  if not p_approve then
    if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'Catatan penolakan wajib diisi'; end if;
    update kasbon_requests set status = 'ditolak', decided_by = auth.uid(), decided_at = now(), decision_note = trim(p_note) where kasbon_requests.id = p_id;
  else
    select name into who from staff where staff.id = r.staff_id and active for update;
    if who is null then raise exception 'Staf sudah tidak aktif'; end if;
    select * into st from settings;
    used := kasbon_week_used(r.staff_id, r.week_start, r.id, true);
    if used + r.amount > st.kasbon_weekly_limit then
      if not p_override then
        raise exception 'Melebihi limit kasbon minggu itu (limit Rp%, terpakai Rp%, sisa Rp%). Setujui dengan override + catatan, atau tolak.',
          to_char(st.kasbon_weekly_limit, 'FM999G999G999'), to_char(used, 'FM999G999G999'), to_char(greatest(0, st.kasbon_weekly_limit - used), 'FM999G999G999');
      end if;
      if length(trim(coalesce(p_note, ''))) = 0 then raise exception 'Catatan override limit wajib diisi'; end if;
      update kasbon_requests set limit_override = true, override_by = auth.uid() where kasbon_requests.id = p_id;
    end if;
    update kasbon_requests set status = 'disetujui', decided_by = auth.uid(), decided_at = now(), decision_note = nullif(trim(coalesce(p_note, '')), '') where kasbon_requests.id = p_id;
  end if;
  begin
    if r.requested_by is not null then
      insert into notifications (target_role, target_user, kind, payload)
      select p.role, p.id, 'kasbon_decision', jsonb_build_object('request_id', p_id, 'approved', p_approve, 'amount', r.amount)
      from profiles p where p.id = r.requested_by and p.role in ('manager', 'cashier');
    end if;
  exception when others then raise warning 'notifikasi kasbon gagal: %', sqlerrm; end;
end $$;

create function kasbon_pay(p_id uuid, p_proof_path text) returns uuid
language plpgsql security definer set search_path = public as $$
declare r kasbon_requests; d date := jkt_today(); adj uuid; exp uuid;
begin
  perform require_role('manager');
  if not kasbon_is_approver() then raise exception 'Hanya owner yang mencatat transfer kasbon' using errcode = '42501'; end if;
  select * into r from kasbon_requests where kasbon_requests.id = p_id for update;
  if not found or r.status <> 'disetujui' then raise exception 'Pengajuan tidak ditemukan atau belum disetujui / sudah dibayar'; end if;
  if coalesce(p_proof_path, '') = '' then raise exception 'Bukti transfer wajib diunggah'; end if;
  if p_proof_path not like 'kasbon/' || p_id::text || '/%' then raise exception 'Bukti transfer harus di folder kasbon/% ', p_id; end if;
  if not exists (select 1 from storage.objects where bucket_id = 'receipts' and name = p_proof_path) then
    raise exception 'Berkas bukti transfer tidak ditemukan di penyimpanan';
  end if;
  if exists (select 1 from payroll_periods where month = date_trunc('month', d)::date and status = 'closed') then
    raise exception 'Gaji bulan % sudah ditutup — batalkan pengajuan dan ajukan ulang bulan depan', to_char(d, 'MM/YYYY');
  end if;
  -- paritas dengan add_expense(kasbon): potongan gaji bulanan + expenses (utang komisi mingguan)
  insert into payroll_adjustments (staff_id, month, kind, amount, reason)
  values (r.staff_id, date_trunc('month', d)::date, 'deduction', -r.amount, 'Kasbon ' || to_char(d, 'DD/MM') || ': ' || r.reason)
  returning payroll_adjustments.id into adj;
  insert into expenses (date, category, description, amount, source, receipt_path, staff_id, adjustment_id)
  values (d, 'kasbon', r.reason, r.amount, 'transfer', p_proof_path, r.staff_id, adj)
  returning expenses.id into exp;
  update kasbon_requests set status = 'dibayar', paid_by = auth.uid(), paid_at = now(), proof_path = p_proof_path, expense_id = exp where kasbon_requests.id = p_id;
  return exp;
end $$;

create function kasbon_cancel(p_id uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare r kasbon_requests; appr boolean := kasbon_is_approver();
begin
  perform require_role('manager', 'cashier');
  if length(trim(coalesce(p_reason, ''))) = 0 then raise exception 'Alasan pembatalan wajib diisi'; end if;
  select * into r from kasbon_requests where kasbon_requests.id = p_id for update;
  if not found then raise exception 'Pengajuan tidak ditemukan'; end if;
  if r.status = 'dibayar' then raise exception 'Kasbon sudah dibayar — batalkan lewat Pengeluaran (Batalkan)'; end if;
  if not ((r.status = 'diajukan' and (appr or r.requested_by = auth.uid())) or (r.status = 'disetujui' and appr)) then
    raise exception 'Pengajuan tidak bisa dibatalkan oleh Anda / sudah final' using errcode = '42501';
  end if;
  update kasbon_requests set status = 'dibatalkan', cancelled_by = auth.uid(), cancelled_at = now(), cancel_reason = trim(p_reason) where kasbon_requests.id = p_id;
end $$;

revoke execute on function kasbon_request(uuid, bigint, text), kasbon_decide(uuid, boolean, text, boolean), kasbon_pay(uuid, text), kasbon_cancel(uuid, text) from public, anon;
grant execute on function kasbon_request(uuid, bigint, text), kasbon_decide(uuid, boolean, text, boolean), kasbon_pay(uuid, text), kasbon_cancel(uuid, text) to authenticated;

-- ---------- patch fungsi lama (backup definisi lama: lihat riwayat migrasi 20261011000003 / 20261014000002 / 20261101000008) ----------
do $$
declare def text; old text;
begin
  -- add_expense: tutup jalur langsung HANYA bila flag nyala (AC20)
  def := pg_get_functiondef('add_expense(date,text,text,bigint,text,text,uuid,uuid)'::regprocedure); old := def;
  def := replace(def, $a$  perform require_role('manager', 'cashier');
$a$, $a$  perform require_role('manager', 'cashier');
  if p_category = 'kasbon' and (select kasbon_flow_on from settings) then
    raise exception 'Kasbon lewat pengajuan (menu Kasbon) — tidak bisa dicatat langsung sebagai pengeluaran';
  end if;
$a$);
  if def = old then raise exception 'Patch add_expense tidak menemukan teks'; end if;
  execute def;

  -- void_expense: kasbon yang berasal dari pengajuan hanya bisa dibatalkan owner (B4)
  def := pg_get_functiondef('void_expense(uuid,text)'::regprocedure); old := def;
  def := replace(def, $a$  perform require_role('manager');
$a$, $a$  perform require_role('manager');
  if exists (select 1 from kasbon_requests where expense_id = p_id) and not kasbon_is_approver() then
    raise exception 'Hanya owner yang bisa membatalkan kasbon yang sudah ditransfer' using errcode = '42501';
  end if;
$a$);
  if def = old then raise exception 'Patch void_expense tidak menemukan teks'; end if;
  execute def;
end $$;

-- Info alur untuk UI (kasir tidak boleh baca settings): flag, limit, apakah pemanggil = approver.
create function kasbon_info() returns table (flow_on boolean, weekly_limit bigint, is_approver boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  return query select s.kasbon_flow_on, s.kasbon_weekly_limit, kasbon_is_approver() from settings s;
end $$;
revoke execute on function kasbon_info() from public, anon;
grant execute on function kasbon_info() to authenticated;
