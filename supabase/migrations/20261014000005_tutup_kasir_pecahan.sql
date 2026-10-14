-- Tutup kasir:
--   1. Hitung per pecahan (opsional): cash_closings.denominations = {"100000": lembar, …, "coins": total koin Rp}; jumlahnya = kas fisik.
--   2. Toleransi selisih (settings.cash_tolerance, default Rp2.000): selisih |≤ toleransi| dianggap pembulatan/receh
--      → tidak ditandai merah di layar tutup kasir & Anti-fraud. Angka selisih tetap tersimpan apa adanya.
alter table settings add column cash_tolerance bigint not null default 2000 check (cash_tolerance >= 0);
alter table cash_closings add column denominations jsonb;

drop function save_cash_closing(date, bigint, text, bigint);
create function save_cash_closing(p_date date, p_physical_cash bigint, p_note text default '', p_deposit_out bigint default 0, p_denoms jsonb default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare s jsonb; id uuid; counted bigint;
begin
  perform require_role('manager', 'cashier');
  if p_physical_cash is null or p_physical_cash < 0 then raise exception 'Isi kas fisik'; end if;
  if coalesce(p_deposit_out, 0) < 0 or coalesce(p_deposit_out, 0) > p_physical_cash then
    raise exception 'Uang yang disetor tidak boleh melebihi isi laci';
  end if;
  if p_denoms is not null then
    select coalesce(sum(case when key = 'coins' then value::bigint else key::bigint * value::bigint end), 0) into counted
    from jsonb_each_text(p_denoms) where key = 'coins' or key ~ '^\d+$';
    if counted <> p_physical_cash then raise exception 'Jumlah per pecahan (Rp%) tidak sama dengan kas fisik', counted; end if;
  end if;
  perform pg_advisory_xact_lock(hashtext('cash_closing:' || p_date));
  if auth_role() = 'cashier' then
    if p_date not between jkt_today() - 1 and jkt_today() then raise exception 'Kasir hanya bisa menutup hari ini atau kemarin'; end if;
    if exists (select 1 from cash_closings where date = p_date) then
      raise exception 'Kasir tanggal ini sudah ditutup. Koreksi dilakukan manajer.';
    end if;
  end if;
  s := cash_summary_full(p_date);
  insert into cash_closings (date, expected_cash, physical_cash, summary, note, deposit_out, denominations)
  values (p_date, (s ->> 'expected_cash')::bigint, p_physical_cash, s, coalesce(p_note, ''), coalesce(p_deposit_out, 0), p_denoms)
  returning cash_closings.id into id;
  return id;
end $$;
revoke execute on function save_cash_closing(date, bigint, text, bigint, jsonb) from public, anon;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['cash_summary_full', $a$return r || jsonb_build_object('opening_cash', drawer_opening(p_date),$a$,
          $a$return r || jsonb_build_object('tolerance', (select cash_tolerance from settings), 'opening_cash', drawer_opening(p_date),$a$],
    array['fraud_overview', $a$  return jsonb_build_object(
    -- layanan selesai$a$, $a$  return jsonb_build_object('cash_tolerance', (select cash_tolerance from settings),
    -- layanan selesai$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % #% tidak menemukan teks', fn, i; end if;
    execute def;
  end loop;
end $$;
