-- Promo booking online: diskon X% untuk layanan dari booking yang DIBUAT online di dalam periode promo.
-- Dihitung otomatis di checkout (kasir tidak bisa mengubah), tidak ditumpuk dengan diskon paket: dipakai yang lebih besar.
-- Retail yang ditambah di kasir & layanan walk-in/WA tidak ikut. 0% = promo mati.
alter table settings
  add column online_promo_pct int not null default 0 check (online_promo_pct between 0 and 50),
  add column online_promo_start date,
  add column online_promo_end date,
  add constraint online_promo_period check (online_promo_pct = 0
    or (online_promo_start is not null and online_promo_end is not null and online_promo_end >= online_promo_start));

-- Kolom baru di akhir view publik (landing: banner promo; kasir: pratinjau diskon).
do $$
declare def text := pg_get_viewdef('public_settings');
begin
  def := replace(def, E'\n   FROM settings;', E',\n    online_promo_pct, online_promo_start, online_promo_end\n   FROM settings;');
  if def = pg_get_viewdef('public_settings') then raise exception 'public_settings: pola FROM tidak ditemukan'; end if;
  execute 'create or replace view public_settings as ' || def;
end $$;

-- checkout(): tandai baris layanan yang berasal dari booking online dalam periode promo, hitung diskon promo,
-- pilih yang lebih besar dari diskon paket, dan bagi porsi diskon hanya ke baris promo (komisi tetap adil).
do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['checkout', $a$allocated bigint := 0; last_svc int;$a$,
          $a$allocated bigint := 0; last_svc int; promo_base bigint; promo_disc bigint := 0; last_promo int; use_promo boolean := false;$a$],
    array['checkout', $a$'from_upsell', coalesce((e.v ->> 'from_upsell')::boolean, false)) order by e.ord),$a$,
          $a$'from_upsell', coalesce((e.v ->> 'from_upsell')::boolean, false),
           'promo', coalesce(s.category <> 'retail' and a.source = 'online' and st.online_promo_pct > 0
                             and (a.created_at at time zone 'Asia/Jakarta')::date between st.online_promo_start and st.online_promo_end, false)) order by e.ord),$a$],
    array['checkout', $a$max(o) filter (where x ->> 'category' <> 'retail')
  into sub, base, has_b, has_n, last_svc$a$,
          $a$max(o) filter (where x ->> 'category' <> 'retail'),
         coalesce(sum((x ->> 'price')::bigint) filter (where (x ->> 'promo')::boolean), 0),
         max(o) filter (where (x ->> 'promo')::boolean)
  into sub, base, has_b, has_n, last_svc, promo_base, last_promo$a$],
    array['checkout', $a$if has_b and has_n then disc := round(base * st.bundle_pct / 10000.0) * 100; end if;$a$,
          $a$if has_b and has_n then disc := round(base * st.bundle_pct / 10000.0) * 100; end if;
  promo_disc := round(promo_base * st.online_promo_pct / 10000.0) * 100;
  if promo_disc > disc then disc := promo_disc; use_promo := true; end if;  -- tidak ditumpuk: pakai yang lebih besar$a$],
    array['checkout', $a$case when disc > 0 then 'Diskon paket ' || st.bundle_pct || '%' else '' end$a$,
          $a$case when use_promo then 'Promo booking online ' || st.online_promo_pct || '%'
               when disc > 0 then 'Diskon paket ' || st.bundle_pct || '%' else '' end$a$],
    array['checkout', $a$if disc > 0 and l ->> 'category' <> 'retail' then
      share := case when i = last_svc then disc - allocated
                    else floor(disc::numeric * (l ->> 'price')::bigint / base)::bigint end;$a$,
          $a$if disc > 0 and l ->> 'category' <> 'retail' and (not use_promo or (l ->> 'promo')::boolean) then
      share := case when i = (case when use_promo then last_promo else last_svc end) then disc - allocated
                    else floor(disc::numeric * (l ->> 'price')::bigint / (case when use_promo then promo_base else base end))::bigint end;$a$],
    -- laporan owner: biaya promo terlihat terpisah dari diskon paket
    array['owner_finance', $a$'discount', (select coalesce(sum(discount_share), 0) from it),$a$,
          $a$'discount', (select coalesce(sum(discount_share), 0) from it),
    'discount_promo', (select coalesce(sum(discount_amount), 0) from tx where voided_at is null and discount_label like 'Promo booking online%'),$a$]
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
