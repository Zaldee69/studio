-- Analitik Paket A (rapat 31 Okt, "rekam dulu, tampilkan belakangan"):
--  1. Pijat (±41% omzet Okt) ikut di KPI: transaksi & AOV pijat, AOV harian pijat.
--  2. Selisih durasi: catatan < 5 menit (tombol mulai/selesai ditekan berurutan) tidak dihitung.
--  3. Laporan owner periode bukan bulan penuh: upah = komisi + jaring harian + gaji pokok prorata (bukan komisi saja).
--  4. Pencatatan pelanggan: % transaksi dengan pelanggan per hari & per kasir; baris di cek tengah minggu (Telegram Kamis).
--  5. Campaign: "pelanggan baru per sumber" = transaksi pertama di periode (bukan tanggal kontak dibuat — 197 kontak impor 26 Okt).

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['kpi_period(date,date,text,uuid)',
          $a$'tx_nail', coalesce((select tx from c where category = 'nail'), 0),$a$,
          $a$'tx_nail', coalesce((select tx from c where category = 'nail'), 0),
    'tx_massage', coalesce((select tx from c where category = 'massage'), 0),$a$],
    array['kpi_period(date,date,text,uuid)',
          $a$'aov_nail', case when (r ->> 'tx_nail')::int > 0 then round((r ->> 'rev_nail')::numeric / (r ->> 'tx_nail')::int) end,$a$,
          $a$'aov_nail', case when (r ->> 'tx_nail')::int > 0 then round((r ->> 'rev_nail')::numeric / (r ->> 'tx_nail')::int) end,
    'aov_massage', case when (r ->> 'tx_massage')::int > 0 then round((r ->> 'rev_massage')::numeric / (r ->> 'tx_massage')::int) end,$a$],
    array['kpi_summary(date,date,text,uuid)',
          $a$'aov_barbershop', 'aov_nail', 'retail_ratio'$a$,
          $a$'aov_barbershop', 'aov_nail', 'aov_massage', 'retail_ratio'$a$],
    array['owner_summary(date,date)',
          $a$'aov_nail', k -> 'aov_nail',$a$,
          $a$'aov_nail', k -> 'aov_nail', 'aov_massage', k -> 'aov_massage',$a$],
    array['kpi_duration_variance(date,date,text,uuid)',
          $a$group by a.id having count(*) = 1$a$,
          $a$  and a.service_ended_at - a.service_started_at >= interval '5 minutes'
    group by a.id having count(*) = 1$a$],
    -- jaring harian: subsidi minggu yang bersinggungan × hari tumpang / 7; gaji pokok: per hari = gaji / hari dalam bulan
    array['owner_report_extra(date,date)',
          $a$'commission_est', (select coalesce(sum(commission), 0) from cl),$a$,
          $a$'commission_est', (select coalesce(sum(commission), 0) from cl),
    'subsidy_est', (select coalesce(round(sum(w.subsidy * (least(wk + 6, p_to) - greatest(wk, p_from) + 1) / 7.0)), 0)::bigint
                    from generate_series(date_trunc('week', p_from)::date, p_to, interval '1 week') g(wk_ts),
                         lateral (select g.wk_ts::date as wk) x, lateral commission_week_rows(x.wk) w),
    'base_salary_est', (select coalesce(round(sum(s.base_salary::numeric / extract(day from date_trunc('month', d) + interval '1 month - 1 day'))), 0)::bigint
                        from generate_series(p_from, p_to, interval '1 day') d
                        join staff s on s.base_salary is not null and s.active and (s.created_at at time zone 'Asia/Jakarta')::date <= d::date),$a$],
    array['campaign_report_data(date,date)',
          $a$from (select coalesce(source, 'tidak_tercatat') as src, count(*) as n from customers
              where deleted_at is null and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to group by 1) c), '[]'),$a$,
          $a$from (select coalesce(cu.source, 'tidak_tercatat') as src, count(*) as n from customers cu
              join (select customer_id, min((created_at at time zone 'Asia/Jakarta')::date) as first_d from transactions
                    where voided_at is null and customer_id is not null group by 1) f on f.customer_id = cu.id
              where cu.deleted_at is null and f.first_d between p_from and p_to group by 1) c), '[]'),$a$],
    array['kpi_customers(date,date,date)',
          $a$'window_days', st.return_window_days,$a$,
          $a$'window_days', st.return_window_days,
    'recorded', (select jsonb_build_object('tx', count(*), 'with_customer', count(t.customer_id)) from transactions t
                 where t.voided_at is null and (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to),
    'recorded_daily', (select coalesce(jsonb_agg(jsonb_build_object('day', x.d, 'tx', x.n, 'with_customer', x.wc) order by x.d), '[]')
                       from (select (t.created_at at time zone 'Asia/Jakarta')::date as d, count(*) as n, count(t.customer_id) as wc
                             from transactions t where t.voided_at is null and (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
                             group by 1) x),
    'recorded_by_cashier', (select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'tx', x.n, 'with_customer', x.wc) order by x.n desc), '[]')
                            from (select coalesce(nullif(p.full_name, ''), 'tanpa nama') as name, count(*) as n, count(t.customer_id) as wc
                                  from transactions t left join profiles p on p.id = t.cashier_id
                                  where t.voided_at is null and (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
                                  group by 1) x),$a$],
    array['alert_midweek()',
          $a$else 'Target Senin–Kamis sudah tercapai 👍' end));$a$,
          $a$else 'Target Senin–Kamis sudah tercapai 👍' end)
    || (select format(E'\nTransaksi dengan pelanggan minggu ini: %s dari %s (%s%%) · target 40%% (8 Nov) → 60%% (30 Nov)',
                      count(customer_id), count(*), coalesce(round(count(customer_id) * 100.0 / nullif(count(*), 0)), 0))
        from transactions where voided_at is null and created_at >= jkt(w, '00:00')));$a$]
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

-- AOV harian + kolom pijat (tipe hasil berubah → buat ulang)
drop function kpi_aov_daily(date, date, text, uuid);
create function kpi_aov_daily(p_from date, p_to date, p_category text default null, p_staff_id uuid default null)
returns table (day date, aov_barbershop bigint, aov_nail bigint, aov_massage bigint, tx_barbershop int, tx_nail int, tx_massage int, omzet bigint)
language plpgsql stable security definer set search_path = public as $$
#variable_conflict use_column
begin
  perform require_role('manager');
  return query
  with s as (select * from daily_sales(p_from, p_to) where by_staff = (p_staff_id is not null) and (p_staff_id is null or staff_id = p_staff_id)),
  a as (select s.day, category, round(sum(revenue_net)::numeric / nullif(sum(tx_count), 0))::bigint as aov, sum(tx_count)::int as tx
        from s where category in ('barbershop', 'nail', 'massage') and coalesce(p_category, category::text) = category::text group by 1, 2)
  select g.d::date,
    (select aov from a where a.day = g.d and category = 'barbershop'),
    (select aov from a where a.day = g.d and category = 'nail'),
    (select aov from a where a.day = g.d and category = 'massage'),
    coalesce((select sum(tx_count)::int from s where s.day = g.d and category = 'barbershop'), 0),
    coalesce((select sum(tx_count)::int from s where s.day = g.d and category = 'nail'), 0),
    coalesce((select sum(tx_count)::int from s where s.day = g.d and category = 'massage'), 0),
    coalesce((select sum(revenue_net)::bigint from s where s.day = g.d and category = coalesce(p_category, 'all')), 0)
  from generate_series(p_from, p_to, interval '1 day') g(d) order by 1;
end $$;
revoke execute on function kpi_aov_daily(date, date, text, uuid) from public, anon;
