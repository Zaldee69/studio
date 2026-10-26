-- Notifikasi Telegram lanjutan (owner/manajer). Semua lewat enqueue_alert (antrean outbound_messages, channel telegram).
--   1. Transaksi di-void / refund                       → langsung
--   2. Kasbon baru (+ total minggu ini), pengeluaran besar (≥ settings.alert_expense_min),
--      pengeluaran yang tampak seperti kasbon tapi kategori lain → langsung
--   3. Transaksi terlambat: masuk setelah kasir tanggalnya ditutup, atau layanan dari appointment hari sebelumnya → langsung
--   4. Komisi minggu sudah ditutup tapi belum dibayar > 2 hari → tiap 08.00
--   5. Staf layanan belum dapat pelanggan sampai 15.00 → tiap 15.00
--   6. Keamanan: akun tim baru/diaktifkan/dinonaktifkan/jadi manajer, harga & status layanan berubah (satu pesan per simpan,
--      termasuk rilis harga massal), pengaturan uang & komisi staf berubah, voucher baru/diubah → langsung
--   7. Ringkasan harian saat tutup kasir (menggantikan alert selisih; selisih ≥ batas tetap ditandai ⚠️ di judul)
--   8. Ringkasan minggu lalu + komisi yang harus dibayar → Senin 08.00
-- Gagal antre tidak pernah menggagalkan transaksi/aksi asalnya (safe_alert).
alter table settings add column alert_expense_min bigint not null default 150000 check (alert_expense_min > 0);

create function safe_alert(p_body text) returns void language plpgsql security definer set search_path = public as $$
begin
  perform enqueue_alert(p_body);
exception when others then
  raise warning 'notifikasi gagal antre: %', sqlerrm;
end $$;
revoke execute on function safe_alert(text) from public, anon, authenticated;

-- Nama pelaku aksi (akun yang sedang masuk), "sistem" untuk cron/admin.
create function actor_name() returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(full_name, '') from profiles where id = auth.uid()), 'sistem')
$$;
create function fmt_jam(t timestamptz) returns text language sql stable as $$
  select to_char(t at time zone 'Asia/Jakarta', 'HH24.MI')
$$;
-- "19–25 Okt 2026" / "28 Sep–4 Okt 2026" (minggu Senin–Minggu)
create function fmt_minggu(w date) returns text language sql immutable as $$
  select extract(day from w)::int
         || case when extract(month from w) <> extract(month from w + 6)
                 then ' ' || (array['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'])[extract(month from w)::int] else '' end
         || '–' || substr(fmt_tgl(w + 6), strpos(fmt_tgl(w + 6), ', ') + 2)
$$;
create function pay_label(m text) returns text language sql immutable as $$
  select case m when 'cash' then 'tunai' when 'qris' then 'QRIS' when 'transfer' then 'transfer'
                when 'deposit' then 'deposit' when 'deposit_cash' then 'deposit + tunai' when 'deposit_qris' then 'deposit + QRIS'
                when 'deposit_transfer' then 'deposit + transfer' else m end
$$;
-- "Potong Rambut (Obay), Face mask (Obay)"
create function tx_items_text(p_tx uuid) returns text language sql stable security definer set search_path = public as $$
  select coalesce(string_agg(ti.name || coalesce(' (' || s.name || ')', ''), ', ' order by ti.name), '-')
  from transaction_items ti left join staff s on s.id = ti.staff_id where ti.transaction_id = p_tx
$$;

-- ---------- 7. Ringkasan harian saat tutup kasir ----------
create or replace function alert_cash_closing() returns trigger language plpgsql security definer set search_path = public as $$
declare
  st settings; s jsonb := new.summary; who text; again boolean; big boolean; kas text; per_staf text; kasbon text;
begin
  select * into st from settings;
  big := abs(new.difference) >= coalesce(st.alert_cash_diff, 50000);
  again := exists (select 1 from cash_closings c where c.date = new.date and c.id <> new.id);
  select nullif(full_name, '') into who from profiles where id = new.cashier_id;
  kas := case when new.difference = 0 then '✅ pas'
              when abs(new.difference) <= coalesce(st.cash_tolerance, 0) then 'selisih ' || fmt_rp(new.difference) || ' (dalam toleransi)'
              else case when big then '⚠️ ' else '' end || case when new.difference < 0 then 'KURANG ' else 'LEBIH ' end || fmt_rp(abs(new.difference)) end;
  select string_agg(x.name || ' ' || x.n, ' · ' order by x.n desc, x.name) into per_staf
  from (select s2.name, count(*) as n from transaction_items ti join transactions t on t.id = ti.transaction_id join staff s2 on s2.id = ti.staff_id
        where t.voided_at is null and t.created_at >= jkt(new.date, '00:00') and t.created_at < jkt(new.date + 1, '00:00') and ti.category <> 'retail'
        group by s2.name) x;
  select string_agg(coalesce(s3.name, '?') || ' ' || fmt_rp(e.amount), ' · ' order by e.created_at) into kasbon
  from expenses e left join staff s3 on s3.id = e.staff_id where e.category = 'kasbon' and e.voided_at is null and e.date = new.date;
  perform safe_alert(format(E'%s %s%s\nOmzet %s · %s transaksi\nTunai %s · QRIS %s · Transfer %s%s\nPelanggan: %s\nPengeluaran laci %s (%s)%s\nKas laci: seharusnya %s, dihitung %s → %s\nDitutup oleh: %s · Catatan: %s',
    case when big then '⚠️ SELISIH tutup kasir' else '📊 Tutup kasir' end, fmt_tgl(new.date), case when again then ' (tutup ulang)' else '' end,
    fmt_rp(coalesce((s ->> 'gross_total')::bigint, 0)), coalesce((s ->> 'tx_count')::int, 0),
    fmt_rp(coalesce((s ->> 'cash_sales')::bigint, 0)), fmt_rp(coalesce((s ->> 'qris_sales')::bigint, 0)), fmt_rp(coalesce((s ->> 'transfer_sales')::bigint, 0)),
    case when coalesce((s ->> 'deposit_used')::bigint, 0) > 0 then ' · Deposit ' || fmt_rp((s ->> 'deposit_used')::bigint) else '' end,
    coalesce(per_staf, '-'),
    fmt_rp(coalesce((s ->> 'expense_cash')::bigint, 0)), coalesce((s ->> 'expense_count')::int, 0),
    case when kasbon is not null then E'\nKasbon: ' || kasbon else '' end,
    fmt_rp(new.expected_cash), fmt_rp(new.physical_cash), kas,
    coalesce(who, '-'), coalesce(nullif(trim(new.note), ''), '(kosong)')));
  return null;
end $$;

-- ---------- 1. Void / refund ----------
create function alert_tx_void() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform safe_alert(format(E'🚫 Transaksi DIBATALKAN %s (%s)\nDibuat %s %s · dibatalkan %s oleh %s\nIsi: %s\nAlasan: %s%s',
    fmt_rp(new.total), pay_label(new.payment_method::text), fmt_tgl((new.created_at at time zone 'Asia/Jakarta')::date), fmt_jam(new.created_at),
    fmt_jam(new.voided_at), actor_name(), tx_items_text(new.id), coalesce(nullif(trim(new.void_reason), ''), '-'),
    case when new.refund_date is not null then E'\nUang tunai dikembalikan dari laci (masuk kas ' || fmt_tgl(new.refund_date) || ')' else '' end));
  return null;
end $$;
create trigger transactions_void_alert after update on transactions
  for each row when (old.voided_at is null and new.voided_at is not null) execute function alert_tx_void();

-- ---------- 3. Transaksi terlambat ----------
-- (a) transaksi masuk setelah kasir tanggalnya ditutup (dicek saat transaksi dibuat)
create function alert_tx_after_closing() returns trigger language plpgsql security definer set search_path = public as $$
declare d date := (new.created_at at time zone 'Asia/Jakarta')::date;
begin
  if exists (select 1 from cash_closings where date = d and created_at <= new.created_at) then
    perform safe_alert(format(E'⏰ Transaksi tercatat terlambat: %s (%s) %s\nKasir %s sudah ditutup sebelum transaksi ini masuk%s\nDicatat oleh: %s',
      fmt_rp(new.total), pay_label(new.payment_method::text), fmt_jam(new.created_at), fmt_tgl(d),
      case when new.payment_method::text in ('cash', 'deposit_cash') then ': uang tunai masuk laci setelah dihitung → manajer tutup ulang kasir.' else '.' end,
      actor_name()));
  end if;
  return null;
end $$;
create trigger transactions_after_closing_alert after insert on transactions for each row execute function alert_tx_after_closing();

-- (b) layanan dari appointment hari sebelumnya baru dibayar (kasus Rabu dicatat Kamis) — satu pesan per transaksi
create function alert_tx_late_service() returns trigger language plpgsql security definer set search_path = public as $$
declare t transactions; d date; appt timestamptz; who text;
begin
  select * into t from transactions where id = new.transaction_id;
  d := (t.created_at at time zone 'Asia/Jakarta')::date;
  select start_at into appt from appointments where id = new.appointment_id;
  if appt is null or (appt at time zone 'Asia/Jakarta')::date >= d then return null; end if;
  if exists (select 1 from transaction_items x join appointments a on a.id = x.appointment_id
             where x.transaction_id = new.transaction_id and x.id <> new.id and (a.start_at at time zone 'Asia/Jakarta')::date < d) then
    return null;  -- item lain transaksi ini sudah memicu pesan
  end if;
  select name into who from staff where id = new.staff_id;
  perform safe_alert(format(E'⏰ Transaksi tercatat terlambat: %s%s dari appointment %s %s, dibayar %s %s\nLayanannya dari %s → komisi & jaring harian tercatat di hari yang salah; cek bayaran staf.\nDicatat oleh: %s',
    new.name, coalesce(' (' || who || ')', ''), fmt_tgl((appt at time zone 'Asia/Jakarta')::date), fmt_jam(appt),
    fmt_tgl(d), fmt_jam(t.created_at), fmt_tgl((appt at time zone 'Asia/Jakarta')::date), actor_name()));
  return null;
end $$;
create trigger transaction_items_late_alert after insert on transaction_items for each row
  when (new.appointment_id is not null) execute function alert_tx_late_service();

-- ---------- 2. Pengeluaran: kasbon, nominal besar, kasbon salah kategori ----------
create function alert_expense() returns trigger language plpgsql security definer set search_path = public as $$
declare lim bigint; who text; week_total bigint; w date := date_trunc('week', new.date)::date;
begin
  select alert_expense_min into lim from settings;
  if new.category = 'kasbon' then
    select name into who from staff where id = new.staff_id;
    select coalesce(sum(amount), 0) into week_total from expenses
    where category = 'kasbon' and voided_at is null and staff_id is not distinct from new.staff_id and date between w and w + 6;
    perform safe_alert(format(E'💸 Kasbon %s: %s (%s)\nKeterangan: %s\nTotal kasbon %s minggu %s: %s\nDicatat oleh: %s',
      coalesce(who, '?'), fmt_rp(new.amount), new.source, coalesce(nullif(trim(new.description), ''), '-'),
      coalesce(who, '?'), fmt_minggu(w), fmt_rp(week_total), actor_name()));
  elsif new.description ~* '\m(kasbon|pinjam|pinjem|utang|hutang)\M' then
    perform safe_alert(format(E'⚠️ Kemungkinan kasbon salah kategori: "%s" %s dicatat sebagai %s (%s)\nKasbon harus memakai kategori "Kasbon staf" + nama staf agar terpotong dari bayarannya.\nDicatat oleh: %s',
      trim(new.description), fmt_rp(new.amount), new.category, fmt_tgl(new.date), actor_name()));
  elsif new.amount >= coalesce(lim, 150000) then
    perform safe_alert(format(E'🧾 Pengeluaran besar: %s (%s, dari %s)\nKeterangan: %s · tanggal %s\nDicatat oleh: %s',
      fmt_rp(new.amount), new.category, new.source, coalesce(nullif(trim(new.description), ''), '-'), fmt_tgl(new.date), actor_name()));
  end if;
  return null;
end $$;
create trigger expenses_alert after insert on expenses for each row execute function alert_expense();

-- ---------- 6. Keamanan & perubahan yang memengaruhi uang ----------
create function alert_team_account() returns trigger language plpgsql security definer set search_path = public as $$
declare msg text;
begin
  if new.role not in ('cashier', 'staff', 'manager') and (tg_op = 'INSERT' or old.role not in ('cashier', 'staff', 'manager')) then return null; end if;
  if tg_op = 'INSERT' and not new.active then
    msg := format(E'👤 Akun tim baru mendaftar: %s (%s) sebagai %s\nSetujui atau tolak di Pengaturan → Akun & peran.', new.full_name, coalesce(new.email, '-'), new.role);
  elsif tg_op = 'UPDATE' and new.role = 'manager' and old.role <> 'manager' then
    msg := format('🔐 %s sekarang berperan MANAJER (diubah oleh %s).', new.full_name, actor_name());
  elsif tg_op = 'UPDATE' and new.active and not old.active then
    msg := format('✅ Akun %s diaktifkan sebagai %s oleh %s.', new.full_name, new.role, actor_name());
  elsif tg_op = 'UPDATE' and old.active and not new.active then
    msg := format('⛔ Akun %s (%s) dinonaktifkan oleh %s.', new.full_name, new.role, actor_name());
  end if;
  if msg is not null then perform safe_alert(msg); end if;
  return null;
end $$;
create trigger profiles_alert after insert or update on profiles for each row execute function alert_team_account();

-- Harga/status layanan: satu pesan per simpan (rilis harga massal = satu pesan).
create function alert_services() returns trigger language plpgsql security definer set search_path = public as $$
declare lines text; n int;
begin
  select string_agg(x.line, E'\n' order by x.line), count(*) into lines, n from (
    select '• ' || nw.name ||
           case when nw.price <> od.price then ': ' || fmt_rp(od.price) || ' → ' || fmt_rp(nw.price) else '' end ||
           case when nw.next_price is distinct from od.next_price then ' · harga rilis berikutnya ' || coalesce(fmt_rp(nw.next_price), 'dihapus') else '' end ||
           case when nw.active <> od.active then case when nw.active then ' · DIAKTIFKAN' else ' · DINONAKTIFKAN' end else '' end as line
    from old_rows od join new_rows nw on nw.id = od.id
    where nw.price <> od.price or nw.next_price is distinct from od.next_price or nw.active <> od.active
  ) x;
  if n > 0 then
    perform safe_alert(format(E'💲 Layanan diubah oleh %s (%s):\n%s', actor_name(), n, left(lines, 3000)));
  end if;
  return null;
end $$;
create trigger services_alert after update on services referencing old table as old_rows new table as new_rows
  for each statement execute function alert_services();

create function alert_settings() returns trigger language plpgsql security definer set search_path = public as $$
declare lines text; o jsonb := to_jsonb(old); n jsonb := to_jsonb(new);
begin
  select string_agg('• ' || k.label || ': ' || coalesce(o ->> k.key, '-') || ' → ' || coalesce(n ->> k.key, '-'), E'\n' order by k.ord) into lines
  from (values (1, 'commission_pct', 'Komisi default (%)'), (2, 'retail_commission_pct', 'Komisi ritel (%)'), (3, 'commission_basis', 'Dasar komisi'),
               (4, 'commission_deduct_hpp', 'Komisi dipotong HPP'), (5, 'min_monthly_pay', 'Jaring pengaman bulanan'), (6, 'cash_tolerance', 'Toleransi selisih kasir'),
               (7, 'alert_cash_diff', 'Batas notifikasi selisih'), (8, 'alert_expense_min', 'Batas notifikasi pengeluaran'), (9, 'receipt_required_above', 'Wajib nota di atas'),
               (10, 'petty_cash_limit', 'Batas kas kecil kasir'), (11, 'bundle_pct', 'Diskon paket (%)'), (12, 'online_promo_pct', 'Promo online (%)'),
               (13, 'drawer_start_date', 'Saldo awal laci: tanggal'), (14, 'drawer_start_balance', 'Saldo awal laci: jumlah'), (15, 'manager_mfa_required', 'Wajib verifikasi 2 langkah manajer')
       ) k(ord, key, label)
  where o -> k.key is distinct from n -> k.key;
  if lines is not null then perform safe_alert(format(E'⚙️ Pengaturan diubah oleh %s:\n%s', actor_name(), lines)); end if;
  return null;
end $$;
create trigger settings_alert after update on settings for each row execute function alert_settings();

create function alert_staff_pay() returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform safe_alert(format(E'⚙️ Aturan bayaran %s diubah oleh %s:%s%s', new.name, actor_name(),
    case when new.commission_pct_override is distinct from old.commission_pct_override
         then E'\n• Komisi khusus: ' || coalesce(old.commission_pct_override::text || '%', 'default') || ' → ' || coalesce(new.commission_pct_override::text || '%', 'default') else '' end,
    case when new.daily_min_pay is distinct from old.daily_min_pay
         then E'\n• Jaring harian: ' || coalesce(fmt_rp(old.daily_min_pay), 'tidak ada') || ' → ' || coalesce(fmt_rp(new.daily_min_pay), 'tidak ada') else '' end));
  return null;
end $$;
create trigger staff_pay_alert after update on staff for each row
  when (old.commission_pct_override is distinct from new.commission_pct_override or old.daily_min_pay is distinct from new.daily_min_pay)
  execute function alert_staff_pay();

create function alert_voucher() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and (new.kind, new.value, new.quota, new.min_spend, new.active, new.starts_on, new.ends_on)
                        is not distinct from (old.kind, old.value, old.quota, old.min_spend, old.active, old.starts_on, old.ends_on) then
    return null;
  end if;
  perform safe_alert(format(E'🎟️ Voucher %s %s oleh %s: %s · kuota %s · min. belanja %s · berlaku %s s/d %s%s',
    new.code, case when tg_op = 'INSERT' then 'dibuat' else 'diubah' end, actor_name(),
    case when new.kind = 'pct' then new.value || '%' else fmt_rp(new.value) end,
    coalesce(new.quota::text, 'tanpa batas'), case when new.min_spend > 0 then fmt_rp(new.min_spend) else '-' end,
    coalesce(fmt_tgl(new.starts_on), '-'), coalesce(fmt_tgl(new.ends_on), '-'), case when not new.active then ' · NONAKTIF' else '' end));
  return null;
end $$;
create trigger vouchers_alert after insert or update on vouchers for each row execute function alert_voucher();

-- ---------- 5. Staf layanan belum dapat pelanggan sampai 15.00 ----------
create function alert_idle_staff() returns void language plpgsql security definer set search_path = public as $$
declare d date := jkt_today(); names text;
begin
  if exists (select 1 from special_closures where date = d) or exists (select 1 from opening_hours where weekday = extract(dow from d) and closed) then
    return;
  end if;
  select string_agg(s.name, ', ' order by s.name) into names from staff s
  where s.active and s.category in ('barbershop', 'nail')
    and not exists (select 1 from staff_time_off t where t.staff_id = s.id and t.status = 'approved' and t.all_day
                    and t.start_at < jkt(d + 1, '00:00') and t.end_at > jkt(d, '00:00'))
    and not exists (select 1 from transaction_items ti join transactions t on t.id = ti.transaction_id
                    where ti.staff_id = s.id and t.voided_at is null and t.created_at >= jkt(d, '00:00'))
    and not exists (select 1 from appointments a where a.staff_id = s.id and a.start_at >= jkt(d, '00:00') and a.start_at < jkt(d + 1, '00:00')
                    and a.status in ('arrived', 'in_service', 'completed', 'paid'));
  if names is not null then
    perform safe_alert(format(E'🪑 Sampai 15.00 belum ada pelanggan: %s.\nSaatnya posting status WA/IG atau kirim promo hari kerja. Pastikan stafnya memang masuk.', names));
  end if;
end $$;
revoke execute on function alert_idle_staff() from public, anon, authenticated;

-- ---------- 4. Komisi minggu ditutup tapi belum dibayar > 2 hari ----------
create function alert_unpaid_weeks() returns void language plpgsql security definer set search_path = public as $$
declare lines text;
begin
  select string_agg(x.line, E'\n' order by x.week_start) into lines from (
    select w.week_start, '• Minggu ' || fmt_minggu(w.week_start) || ' (ditutup ' || (jkt_today() - (w.closed_at at time zone 'Asia/Jakarta')::date) || ' hari lalu): '
           || string_agg(s.name || ' ' || fmt_rp(p.amount), ' · ' order by s.name) as line
    from commission_weeks w join commission_week_pays p on p.week_start = w.week_start join staff s on s.id = p.staff_id
    where w.status = 'closed' and w.closed_at < now() - interval '2 days' and p.paid_at is null and p.amount > 0
    group by w.week_start, w.closed_at
  ) x;
  if lines is not null then
    perform safe_alert(format(E'💰 Komisi sudah ditutup tapi BELUM DIBAYAR:\n%s\nSetelah dibayar, tandai di SDM → Mingguan.', lines));
  end if;
end $$;
revoke execute on function alert_unpaid_weeks() from public, anon, authenticated;

-- ---------- 8. Ringkasan minggu lalu (Senin pagi) ----------
create function alert_weekly_summary() returns void language plpgsql security definer set search_path = public as $$
declare
  w date := date_trunc('week', jkt_today() - 7)::date; a timestamptz := jkt(w, '00:00'); b timestamptz := jkt(w + 7, '00:00');
  omzet bigint; prev bigint; ntx int; nwa int; cuts int; barb_net bigint; barb_tx int; per_staf text; pay text; is_closed boolean;
begin
  select coalesce(sum(total), 0), count(*), count(*) filter (where c.whatsapp is not null and c.whatsapp <> '')
    into omzet, ntx, nwa
  from transactions t left join customers c on c.id = t.customer_id where t.voided_at is null and t.created_at >= a and t.created_at < b;
  select coalesce(sum(total), 0) into prev from transactions where voided_at is null and created_at >= jkt(w - 7, '00:00') and created_at < a;
  select count(*), coalesce(sum(ti.net_amount), 0), count(distinct ti.transaction_id) into cuts, barb_net, barb_tx
  from transaction_items ti join transactions t on t.id = ti.transaction_id
  where t.voided_at is null and t.created_at >= a and t.created_at < b and ti.category = 'barbershop';
  select string_agg(x.name || ' ' || x.n, ' · ' order by x.n desc, x.name) into per_staf from (
    select s.name, count(*) as n from transaction_items ti join transactions t on t.id = ti.transaction_id join staff s on s.id = ti.staff_id
    where t.voided_at is null and t.created_at >= a and t.created_at < b and ti.category <> 'retail' group by s.name) x;
  is_closed := exists (select 1 from commission_weeks where week_start = w and status = 'closed');
  select string_agg(s.name || ' ' || fmt_rp(r.amt), ' · ' order by s.name) || ' (total ' || fmt_rp(sum(r.amt)::bigint) || ')' into pay
  from (select staff_id, sum(amount)::bigint as amt from commission_week_rows(w) group by staff_id) r join staff s on s.id = r.staff_id;
  perform safe_alert(format(E'📈 Ringkasan minggu %s\nOmzet %s · %s transaksi (minggu sebelumnya %s%s)\nBarbershop: %s layanan · %s/hari · rata-rata %s/transaksi\nPelanggan ber-WA: %s%% dari transaksi\nPelanggan per staf: %s\nKomisi minggu ini: %s\n%s',
    fmt_minggu(w), fmt_rp(omzet), ntx, fmt_rp(prev),
    case when prev > 0 then ', ' || case when omzet >= prev then '+' else '' end || round((omzet - prev) * 100.0 / prev) || '%' else '' end,
    cuts, replace(to_char(cuts / 7.0, 'FM990.0'), '.', ','), fmt_rp(case when barb_tx > 0 then barb_net / barb_tx else 0 end),
    case when ntx > 0 then round(nwa * 100.0 / ntx) else 0 end, coalesce(per_staf, '-'), coalesce(pay, '-'),
    case when is_closed then 'Minggu ini sudah ditutup → bayar & tandai dibayar di SDM → Mingguan.'
         else '⚠️ Minggu ini BELUM DITUTUP → tutup di SDM → Mingguan, lalu bayar.' end));
end $$;
revoke execute on function alert_weekly_summary() from public, anon, authenticated;

create function alert_morning() returns void language plpgsql security definer set search_path = public as $$
begin
  perform alert_unpaid_weeks();
  if extract(isodow from jkt_today()) = 1 then perform alert_weekly_summary(); end if;
end $$;
revoke execute on function alert_morning() from public, anon, authenticated;

select cron.schedule('gb-alert-pagi', '5 1 * * *', $$select public.alert_morning()$$);       -- 08.05 WIB (setelah cek kasir belum ditutup)
select cron.schedule('gb-alert-sepi', '0 8 * * *', $$select public.alert_idle_staff()$$);    -- 15.00 WIB
