-- Analitik Paket B (rapat 31 Okt, rilis bersama 16 Nov):
--  1. Antrean walk-in: walk-in yang menunggu dicatat "Datang" lalu "Mulai" → tunggu = mulai − datang; "Pulang sebelum dilayani"
--     = pembatalan walk-in dengan alasan itu. Ringkasan di kpi_dashboard → 'queue'.
--  2. Tanda "diminta pelanggan": walk-in yang staf-nya bukan giliran (true) / sesuai giliran (false); null = booking/tidak diketahui.
--  3. Rapor WA mingguan juga untuk terapis pijat (pelanggan dilayani, bukan potong).
--  4. Campaign: per kode voucher — omzet bersih, komisi, dan bagian studio (komisi dihitung dari harga normal → diskon ditanggung studio).
--  5. Laporan owner: kelengkapan HPP (item jasa ber-HPP) agar margin kotor tidak dibaca ±99%.

alter table appointments add column requested_staff boolean;
comment on column appointments.requested_staff is 'Walk-in: true = pelanggan meminta staf ini (bukan giliran), false = sesuai giliran, null = booking / belum dicatat';

create function mark_walk_in_turn(p_id uuid, p_requested boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_role('manager', 'cashier');
  update appointments set requested_staff = p_requested where id = p_id and source = 'walk_in';
end $$;
revoke execute on function mark_walk_in_turn(uuid, boolean) from public, anon;
grant execute on function mark_walk_in_turn(uuid, boolean) to authenticated;

-- 'Pulang sebelum dilayani' = teks tombol di laci booking (src/features/jadwal/booking-drawer.tsx)
create function kpi_queue(p_from date, p_to date) returns jsonb
language sql stable security definer set search_path = public as $$
  with w as (
    select a.*, extract(isodow from a.start_at at time zone 'Asia/Jakarta')::int >= 6 as weekend,
           extract(epoch from a.service_started_at - a.arrived_at) / 60 as wait
    from appointments a
    where a.source = 'walk_in' and a.start_at >= jkt(p_from, '00:00') and a.start_at < jkt(p_to + 1, '00:00')
  ), served as (select * from w where service_started_at is not null and arrived_at is not null)
  select jsonb_build_object(
    'walk_ins', (select count(*) from served),
    'queued', (select count(*) from served where wait >= 1),
    'wait_median', (select percentile_cont(0.5) within group (order by wait) from served),
    'wait_p90', (select percentile_cont(0.9) within group (order by wait) from served),
    'wait_median_weekend', (select percentile_cont(0.5) within group (order by wait) from served where weekend),
    'wait_p90_weekend', (select percentile_cont(0.9) within group (order by wait) from served where weekend),
    'walk_aways', (select count(*) from w where status = 'cancelled' and cancel_reason = 'Pulang sebelum dilayani'),
    'by_staff', coalesce((select jsonb_agg(jsonb_build_object('name', s.name, 'walk_ins', x.n, 'requested', x.req, 'turn', x.turn) order by x.n desc)
                          from (select staff_id, count(*) as n, count(*) filter (where requested_staff) as req,
                                       count(*) filter (where requested_staff = false) as turn
                                from w where status <> 'cancelled' group by staff_id) x join staff s on s.id = x.staff_id), '[]'))
$$;
revoke execute on function kpi_queue(date, date) from public, anon, authenticated;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['kpi_dashboard(date,date,text,uuid)',
          $a$'online', kpi_online(p_from, p_to),$a$,
          $a$'online', kpi_online(p_from, p_to),
    'queue', kpi_queue(p_from, p_to),$a$],
    -- ponytail: komisi per transaksi voucher memanggil commission_lines(bulan) per baris — cukup untuk puluhan transaksi voucher
    array['campaign_report_data(date,date)',
          $a$select voucher_id, count(*) as n, sum(discount_amount) as disc from transactions
          where voided_at is null and voucher_id is not null and (created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          group by voucher_id) x on x.voucher_id = v.id), '[]'),$a$,
          $a$select t.voucher_id, count(*) as n, sum(t.discount_amount) as disc, sum(t.total) as net,
                 sum((select coalesce(sum(l.commission), 0) from commission_lines(date_trunc('month', t.created_at at time zone 'Asia/Jakarta')::date) l
                      where l.transaction_id = t.id)) as comm
          from transactions t
          where t.voided_at is null and t.voucher_id is not null and (t.created_at at time zone 'Asia/Jakarta')::date between p_from and p_to
          group by t.voucher_id) x on x.voucher_id = v.id), '[]'),$a$],
    array['campaign_report_data(date,date)',
          $a$'tx', x.n, 'discount', x.disc)$a$,
          $a$'tx', x.n, 'discount', x.disc, 'net', x.net, 'commission', x.comm, 'studio', x.net - x.comm)$a$],
    array['owner_report_extra(date,date)',
          $a$'commission_est', (select coalesce(sum(commission), 0) from cl),$a$,
          $a$'commission_est', (select coalesce(sum(commission), 0) from cl),
    'hpp_items', (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id
                  where t.voided_at is null and ti.category <> 'retail' and t.created_at >= a0 and t.created_at < a1),
    'hpp_items_filled', (select count(*) from transaction_items ti join transactions t on t.id = ti.transaction_id
                         join transaction_item_costs c on c.transaction_item_id = ti.id
                         where t.voided_at is null and ti.category <> 'retail' and c.hpp > 0 and t.created_at >= a0 and t.created_at < a1),$a$]
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

-- Rapor mingguan: capster (potong) + terapis (pelanggan pijat dilayani)
create or replace function staff_weekly_report() returns int
language plpgsql security definer set search_path = public as $$
declare w date := date_trunc('week', jkt_today() - 7)::date; n int;
begin
  with svc as (
    select ti.staff_id, s.category::text as cat, t.id as tx, extract(isodow from t.created_at at time zone 'Asia/Jakarta')::int as dow,
           s.name ilike '%groom%' as groom,
           exists (select 1 from transaction_items x where x.transaction_id = t.id and x.id <> ti.id
                     and x.category in ('massage', 'retail') and x.category::text <> s.category::text) as addon,
           t.created_at >= jkt(w, '00:00') as cur
    from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id
    where t.voided_at is null and ((s.category = 'barbershop' and is_cut_service(s.name)) or s.category = 'massage')
      and t.created_at >= jkt(w - 7, '00:00') and t.created_at < jkt(w + 7, '00:00')
  ), agg as (
    -- capster: jumlah potong; terapis: pelanggan (transaksi) — "tambah waktu" tidak dihitung dua kali
    select staff_id, cat,
           case when cat = 'massage' then count(distinct tx) filter (where cur) else count(*) filter (where cur) end as n,
           case when cat = 'massage' then count(distinct tx) filter (where cur and dow <= 4) else count(*) filter (where cur and dow <= 4) end as senkam,
           count(*) filter (where cur and groom) as groom, count(distinct tx) filter (where cur and addon) as addon,
           case when cat = 'massage' then count(distinct tx) filter (where not cur) else count(*) filter (where not cur) end as prev
    from svc group by staff_id, cat
  ), pay as (select staff_id, sum(amount)::bigint as amt from commission_week_rows(w) group by staff_id),
  cm as (select staff_id, sum(commission)::bigint as amt from commission_week_lines(w) group by staff_id),
  ins as (
    insert into outbound_messages (channel, to_address, template, body)
    select 'whatsapp', staff_wa(st.id), 'staff_report', format(
      E'📋 Rapor minggu %s · %s\n%s %s (Sen–Kam %s · Jum–Min %s) · minggu sebelumnya %s\n%s\n%s\nTerima kasih untuk kerja kerasnya minggu lalu 🙏',
      fmt_minggu(w), st.name, case when a.cat = 'massage' then 'Pelanggan pijat' else 'Potong' end, a.n, a.senkam, a.n - a.senkam, a.prev,
      case when a.cat = 'massage' then 'Dengan tambahan potong/retail ' || a.addon
           else format('Paket Groom %s · dengan tambahan pijat/retail %s', a.groom, a.addon) end,
      case when st.pay_monthly then 'Komisi minggu ini: ' || fmt_rp(coalesce(cm.amt, 0)) || ' (dibayar bersama gaji akhir bulan)'
           else 'Bayaran: ' || fmt_rp(coalesce(pay.amt, 0)) end)
    from staff st join agg a on a.staff_id = st.id and a.cat = st.category::text
    left join pay on pay.staff_id = st.id left join cm on cm.staff_id = st.id
    where st.active and a.n > 0 and staff_wa(st.id) is not null
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;
