-- Audit tumpang tindih Gelombang 2 (1 Nov):
--  • TT-2: target operasional (potong Sen–Kam/hari, batas akhir pekan, naik paket, transaksi dengan pelanggan) tertulis di kode
--    cek tengah minggu, rapat AI, dan halaman Campaign → kolom settings, diubah di Analitik → Target KPI (satu rumah, TT-1).
--    Transaksi dengan pelanggan: 40% sampai 8 Nov, lalu 60% sampai 30 Nov (keputusan owner #3) — owner mengubah angkanya 9 Nov.
--  • TT-1: batas isian target (persen 0–100, rasio ritel min ≤ maks) dijaga database, bukan hanya formulir.
--  • TT-3: fakta untuk asisten AI dibaca dari data (voucher aktif, aturan komisi, kategori yang dibuka, harga potong),
--    bukan teks tertulis (dulu SENKAMWA disebut Rp5.000 padahal 10% maks. Rp10.000).
alter table settings
  add column target_cuts_senkam numeric(4,1) not null default 5.5 check (target_cuts_senkam between 0 and 50),
  add column target_cuts_weekend_max numeric(4,1) not null default 14 check (target_cuts_weekend_max between 0 and 100),
  add column target_upgrade_pct int not null default 30 check (target_upgrade_pct between 0 and 100),
  add column target_customer_pct int not null default 40 check (target_customer_pct between 0 and 100),
  add constraint settings_utilization_target_pct check (utilization_target between 0 and 100),
  add constraint settings_retail_ratio_band check (retail_ratio_min between 0 and 100 and retail_ratio_max between 0 and 100 and retail_ratio_min <= retail_ratio_max);
comment on column settings.target_cuts_senkam is 'Target potong per hari Senin–Kamis (cek tengah minggu, Campaign, rapat AI).';
comment on column settings.target_cuts_weekend_max is 'Batas nyaman potong per hari Jumat–Minggu.';
comment on column settings.target_upgrade_pct is 'Target % potong yang naik paket (layanan bertanda is_upgrade).';
comment on column settings.target_customer_pct is 'Target % transaksi yang tercatat dengan pelanggan.';

-- fakta studio untuk AI: satu sumber, dibaca dari data
create function ai_studio_facts() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    -- kategori dibuka = ada staf aktif (nail & lashes masih daftar tunggu → tidak ada staf)
    'kategori_dibuka', (select coalesce(jsonb_agg(distinct category::text), '[]') from staff where active),
    'harga_potong_termurah', (select min(price) from services where active and is_cut),
    'komisi', jsonb_build_object('persen', st.commission_pct, 'dasar', case when st.commission_basis = 'gross' then 'harga normal' else 'harga bersih' end,
                                 'dipotong_hpp', st.commission_deduct_hpp),
    'voucher_aktif', (select coalesce(jsonb_agg(jsonb_build_object(
                        'kode', v.code, 'potongan', case when v.kind = 'pct' then v.value || '%' else fmt_rp(v.value) end,
                        'maks_potongan', case when v.max_discount is not null then fmt_rp(v.max_discount) end,
                        'kategori', v.category, 'hari', v.weekdays, 'min_belanja', nullif(v.min_spend, 0), 'kuota', v.quota,
                        'berlaku_sampai', v.ends_on, 'hanya_booking_online', true) order by v.code), '[]')
                      from vouchers v where v.active and (v.ends_on is null or v.ends_on >= jkt_today()) and (v.starts_on is null or v.starts_on <= jkt_today() + 7)),
    'target', jsonb_build_object('potong_senin_kamis_per_hari', st.target_cuts_senkam, 'potong_akhir_pekan_maks_per_hari', st.target_cuts_weekend_max,
                                 'naik_paket_pct_dari_potong', st.target_upgrade_pct, 'transaksi_dengan_pelanggan_pct', st.target_customer_pct))
  from settings st
$$;
revoke execute on function ai_studio_facts() from public, anon, authenticated;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['ai_weekly_facts()',
          $a$'target', jsonb_build_object('potong_senin_kamis_per_hari', 5.5, 'potong_akhir_pekan_maks_per_hari', 14,
                                 'paket_fresh_ke_atas_pct_dari_potong', 30, 'transaksi_dengan_pelanggan_pct', 60),$a$,
          $a$'target', ai_studio_facts() -> 'target',$a$],
    array['ai_weekly_facts()',
          $a$'konteks', 'Barbershop + pijat (pijat tidak dipromosikan di Instagram; nail art belum buka). Harga potong Rp50.000. '
               || 'Voucher SENKAMWA/SENKAMIG Rp5.000 Senin–Kamis s/d 30 Nov. Komisi capster 50% harga normal, tidak dipotong HPP.'$a$,
          $a$'fakta_studio', ai_studio_facts() - 'target'$a$],
    array['alert_midweek()', $a$declare w date := date_trunc('week', jkt_today())::date; per_day text; n int; prev int; wkend int; fu int;$a$,
          $a$declare w date := date_trunc('week', jkt_today())::date; per_day text; n int; prev int; wkend int; fu int; st settings; goal int;$a$],
    array['alert_midweek()', $a$begin
  select string_agg$a$, $a$begin
  select * into st from settings;
  goal := ceil(st.target_cuts_senkam * 4);
  select string_agg$a$],
    array['alert_midweek()', $a$· target 22 (5,5/hari) ·$a$, $a$· target %s (%s/hari) ·$a$],
    array['alert_midweek()', $a$    n, per_day, prev, wkend,
    case when n < 22 then format('Kurang %s potong dari target. Pelanggan "Perlu follow-up": %s → sapa dari menu Pelanggan, tawarkan voucher Senin–Kamis untuk minggu depan.', 22 - n, fu)$a$,
          $a$    n, per_day, goal, replace(st.target_cuts_senkam::text, '.', ','), prev, wkend,
    case when n < goal then format('Kurang %s potong dari target. Pelanggan "Perlu follow-up": %s → sapa dari menu Pelanggan, tawarkan voucher Senin–Kamis untuk minggu depan.', goal - n, fu)$a$],
    array['alert_midweek()', $a$(%s%%) · target 40%% (8 Nov) → 60%% (30 Nov)',
                      count(customer_id), count(*), coalesce(round(count(customer_id) * 100.0 / nullif(count(*), 0)), 0))$a$,
          $a$(%s%%) · target %s%%',
                      count(customer_id), count(*), coalesce(round(count(customer_id) * 100.0 / nullif(count(*), 0)), 0), st.target_customer_pct)$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(fn::regprocedure) into def;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % (%) tidak menemukan teks', i, fn; end if;
    execute def;
  end loop;
end $$;
