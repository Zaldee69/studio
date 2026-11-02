-- Audit tumpang tindih TT-8, TT-9, TT-24 (1 Nov, keputusan owner #4 & #5):
--  • "Potong" = layanan bertanda services.is_cut — sama dengan rapor capster, cek tengah minggu, rapat AI, dan Campaign.
--    Telegram tutup kasir & ringkasan Senin dulu menghitung semua item non-ritel (termasuk pijat) per staf.
--    Satu fungsi staff_counts_text: capster = jumlah potong; staf lain (pijat, nail) = jumlah layanan.
--  • "Akhir pekan" = Jumat–Minggu di semua laporan (Campaign & antrean walk-in dulu Sabtu–Minggu).
--  • Label: "Pelanggan:" di Telegram sebenarnya jumlah item → "Per staf:"; "Komisi minggu ini" di ringkasan Senin
--    sebenarnya minggu lalu.
create function staff_counts_text(p_from timestamptz, p_to timestamptz) returns text
language sql stable security definer set search_path = public as $$
  select string_agg(x.name || ' ' || x.n || x.unit, ' · ' order by x.n desc, x.name)
  from (select s.name,
               case when s.category = 'barbershop' then count(*) filter (where sv.is_cut) else count(*) end as n,
               case when s.category = 'barbershop' then ' potong' else ' layanan' end as unit
        from transaction_items ti join transactions t on t.id = ti.transaction_id join staff s on s.id = ti.staff_id
        left join services sv on sv.id = ti.service_id
        where t.voided_at is null and t.created_at >= p_from and t.created_at < p_to and ti.category <> 'retail'
        group by s.name, s.category) x
  where x.n > 0
$$;
revoke execute on function staff_counts_text(timestamptz, timestamptz) from public, anon, authenticated;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['alert_cash_closing()',
          $a$select string_agg(x.name || ' ' || x.n, ' · ' order by x.n desc, x.name) into per_staf
  from (select s2.name, count(*) as n from transaction_items ti join transactions t on t.id = ti.transaction_id join staff s2 on s2.id = ti.staff_id
        where t.voided_at is null and t.created_at >= jkt(new.date, '00:00') and t.created_at < jkt(new.date + 1, '00:00') and ti.category <> 'retail'
        group by s2.name) x;$a$,
          $a$per_staf := staff_counts_text(jkt(new.date, '00:00'), jkt(new.date + 1, '00:00'));$a$],
    array['alert_cash_closing()', $a$\nPelanggan: %s\n$a$, $a$\nPer staf: %s\n$a$],
    array['alert_weekly_summary()',
          $a$select count(*), coalesce(sum(ti.net_amount), 0), count(distinct ti.transaction_id) into cuts, barb_net, barb_tx
  from transaction_items ti join transactions t on t.id = ti.transaction_id
  where$a$,
          $a$select count(*) filter (where sv.is_cut), coalesce(sum(ti.net_amount), 0), count(distinct ti.transaction_id) into cuts, barb_net, barb_tx
  from transaction_items ti join transactions t on t.id = ti.transaction_id left join services sv on sv.id = ti.service_id
  where$a$],
    array['alert_weekly_summary()',
          $a$select string_agg(x.name || ' ' || x.n, ' · ' order by x.n desc, x.name) into per_staf from (
    select s.name, count(*) as n from transaction_items ti join transactions t on t.id = ti.transaction_id join staff s on s.id = ti.staff_id
    where t.voided_at is null and t.created_at >= a and t.created_at < b and ti.category <> 'retail' group by s.name) x;$a$,
          $a$per_staf := staff_counts_text(a, b);$a$],
    array['alert_weekly_summary()', $a$\nBarbershop: %s layanan · %s/hari · rata-rata %s/transaksi$a$, $a$\nPotong: %s · %s/hari · rata-rata barbershop %s/transaksi$a$],
    array['alert_weekly_summary()', $a$\nPelanggan per staf: %s\nKomisi minggu ini: %s$a$, $a$\nPer staf: %s\nKomisi minggu lalu: %s$a$],
    array['alert_weekly_summary()', $a$'Minggu ini sudah ditutup$a$, $a$'Minggu lalu sudah ditutup$a$],
    array['alert_weekly_summary()', $a$'⚠️ Minggu ini BELUM DITUTUP$a$, $a$'⚠️ Minggu lalu BELUM DITUTUP$a$],
    array['campaign_report_data(date,date)', $a$'weekend_days', count(*) filter (where dow >= 6), 'weekend_cuts', coalesce(sum(n) filter (where dow >= 6), 0)$a$,
          $a$'weekend_days', count(*) filter (where dow >= 5), 'weekend_cuts', coalesce(sum(n) filter (where dow >= 5), 0)$a$],
    array['kpi_queue(date,date)', $a$::int >= 6 as weekend$a$, $a$::int >= 5 as weekend$a$]
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
