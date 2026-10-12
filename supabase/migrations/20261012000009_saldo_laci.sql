-- Saldo laci berjalan. Kasir menghitung SELURUH isi laci saat tutup kasir (bukan hanya uang hari itu):
--   kas diharapkan = saldo awal laci + tunai masuk − tunai keluar (hari itu);
--   saldo awal     = sisa tutup kasir terakhir (isi laci − disetor/diambil) + arus tunai hari-hari yang tidak ditutup;
--   sebelum ada tutup kasir sejak tanggal mulai → saldo awal dari Pengaturan (tanggal mulai + nominal).
-- Tutup kasir sebelum tanggal mulai tidak berubah (saldo awal 0, seperti dulu). Data prod 8–11/10: selisih +Rp453.700
-- karena sisa laci hari sebelumnya ikut dihitung sebagai "lebih".

alter table settings add column drawer_start_date date,
  add column drawer_start_balance bigint not null default 0 check (drawer_start_balance >= 0);
alter table cash_closings add column deposit_out bigint not null default 0,
  add constraint cash_closings_deposit_out check (deposit_out >= 0 and deposit_out <= physical_cash);

-- Saldo laci awal (prod): sisa laci terakhir Rp502.000, berlaku mulai 12 Okt 2026. Bisa dikoreksi manajer di Pengaturan.
update settings set drawer_start_date = '2026-10-12', drawer_start_balance = 502000 where drawer_start_date is null;

-- Arus tunai bersih satu hari di laci (tanpa saldo awal): sama dengan komponen kas diharapkan di cash_summary_full.
create function cash_day_net(p_date date) returns bigint language sql stable security definer set search_path = public as $$
  with b as (select jkt(p_date, '00:00') as t0, jkt(p_date + 1, '00:00') as t1)
  select (coalesce((select sum(paid_amount) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null
                     and payment_method in ('cash', 'deposit_cash')), 0)
        + coalesce((select sum(amount_paid) from deposit_topups, b where created_at >= t0 and created_at < t1 and method = 'cash'), 0)
        - coalesce((select sum(amount) from expenses where date = p_date and source = 'laci' and voided_at is null), 0)
        - coalesce((select sum(tip_amount) from transactions, b where created_at >= t0 and created_at < t1 and voided_at is null), 0))::bigint
$$;

create function drawer_opening(p_date date) returns bigint language plpgsql stable security definer set search_path = public as $$
declare st settings; last record; base bigint; d0 date;
begin
  select * into st from settings;
  if st.drawer_start_date is null or p_date < st.drawer_start_date then return 0; end if;
  select c.date, c.physical_cash - c.deposit_out as carry into last from cash_closings c
  where c.date >= st.drawer_start_date and c.date < p_date order by c.date desc, c.created_at desc limit 1;
  if found then base := last.carry; d0 := last.date + 1; else base := st.drawer_start_balance; d0 := st.drawer_start_date; end if;
  -- hari yang tidak ditutup di antaranya: uang tunainya tetap di laci
  return base + coalesce((select sum(cash_day_net(g::date)) from generate_series(d0, p_date - 1, interval '1 day') g), 0);
end $$;
revoke execute on function cash_day_net(date), drawer_opening(date) from public, anon, authenticated;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('cash_summary_full'::regproc) into def;
  old := def;
  def := replace(def, $a$return r || jsonb_build_object('expected_cash', $a$,
                      $a$return r || jsonb_build_object('opening_cash', drawer_opening(p_date), 'expected_cash', drawer_opening(p_date) + $a$);
  if def = old then raise exception 'Patch cash_summary_full tidak menemukan teks'; end if;
  execute def;
end $$;

-- Tutup kasir: + disetor/diambil dari laci (opsional). Sisa (isi laci − setoran) jadi saldo awal berikutnya.
drop function save_cash_closing(date, bigint, text);
create function save_cash_closing(p_date date, p_physical_cash bigint, p_note text default '', p_deposit_out bigint default 0) returns uuid
language plpgsql security definer set search_path = public as $$
declare s jsonb; id uuid;
begin
  perform require_role('manager', 'cashier');
  if p_physical_cash is null or p_physical_cash < 0 then raise exception 'Isi kas fisik'; end if;
  if coalesce(p_deposit_out, 0) < 0 or coalesce(p_deposit_out, 0) > p_physical_cash then
    raise exception 'Uang yang disetor tidak boleh melebihi isi laci';
  end if;
  perform pg_advisory_xact_lock(hashtext('cash_closing:' || p_date));
  if auth_role() = 'cashier' then
    if p_date not between jkt_today() - 1 and jkt_today() then raise exception 'Kasir hanya bisa menutup hari ini atau kemarin'; end if;
    if exists (select 1 from cash_closings where date = p_date) then
      raise exception 'Kasir tanggal ini sudah ditutup. Koreksi dilakukan manajer.';
    end if;
  end if;
  s := cash_summary_full(p_date);
  insert into cash_closings (date, expected_cash, physical_cash, summary, note, deposit_out)
  values (p_date, (s ->> 'expected_cash')::bigint, p_physical_cash, s, coalesce(p_note, ''), coalesce(p_deposit_out, 0))
  returning cash_closings.id into id;
  return id;
end $$;
revoke execute on function save_cash_closing(date, bigint, text, bigint) from public, anon;
