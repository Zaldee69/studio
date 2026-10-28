-- Rapat tim AI mingguan untuk owner (Telegram, Senin pagi). Database menyiapkan angka ringkasan minggu lalu vs minggu
-- sebelumnya — tanpa nama/nomor pelanggan — lalu memanggil /api/ai/weekly; server meminta Claude menulis analisis
-- dan mengantrekannya ke Telegram owner lewat antrean pesan yang sama.

-- campaign_report dipecah: isi data (dipakai server) + pembungkus khusus manajer (halaman Laporan campaign).
do $$
declare def text; old text;
begin
  select pg_get_functiondef('campaign_report(date, date)'::regprocedure) into def;
  old := def;
  def := replace(def, 'FUNCTION public.campaign_report(', 'FUNCTION public.campaign_report_data(');
  def := replace(def, $a$  perform require_role('manager');
$a$, '');
  if def = old or position('require_role' in def) > 0 then raise exception 'Patch campaign_report_data tidak menemukan teks'; end if;
  execute def;
end $$;
revoke execute on function campaign_report_data(date, date) from public, anon, authenticated;

create or replace function campaign_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  perform require_role('manager');
  return campaign_report_data(p_from, p_to);
end $$;

-- Notulen rapat AI per minggu (ditulis server) → rapat berikutnya membuka dengan rapor tindakan minggu lalu.
create table ai_meetings (
  week date primary key,
  notes text not null,
  created_at timestamptz not null default now()
);
alter table ai_meetings enable row level security;
create policy manager_read on ai_meetings for select to authenticated using (auth_role() = 'manager');

-- Angka minggu lalu (Senin–Minggu) + minggu sebelumnya untuk pembanding. Tidak memuat data pribadi pelanggan.
create function ai_weekly_facts() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare w date := date_trunc('week', jkt_today() - 7)::date;
begin
  return jsonb_build_object(
    'minggu', fmt_minggu(w), 'dari', w, 'sampai', w + 6,
    'target', jsonb_build_object('potong_senin_kamis_per_hari', 5.5, 'potong_akhir_pekan_maks_per_hari', 14,
                                 'paket_fresh_ke_atas_pct_dari_potong', 30, 'transaksi_dengan_pelanggan_pct', 60),
    'minggu_ini', campaign_report_data(w, w + 6),
    'minggu_sebelumnya', campaign_report_data(w - 7, w - 1),
    'transaksi', (select jsonb_build_object('jumlah', count(*), 'omzet', coalesce(sum(total), 0), 'rata_rata', coalesce(round(avg(total)), 0))
                  from transactions where voided_at is null and created_at >= jkt(w, '00:00') and created_at < jkt(w + 7, '00:00')),
    'transaksi_minggu_sebelumnya', (select jsonb_build_object('jumlah', count(*), 'omzet', coalesce(sum(total), 0), 'rata_rata', coalesce(round(avg(total)), 0))
                  from transactions where voided_at is null and created_at >= jkt(w - 7, '00:00') and created_at < jkt(w, '00:00')),
    'per_lini', (select coalesce(jsonb_object_agg(cat, jsonb_build_object('layanan', n, 'omzet', rp, 'hpp', hpp)), '{}') from (
                  select ti.category as cat, count(*) as n, sum(ti.net_amount) as rp, sum(coalesce(c.hpp, 0)) as hpp
                  from transaction_items ti join transactions t on t.id = ti.transaction_id
                  left join transaction_item_costs c on c.transaction_item_id = ti.id
                  where t.voided_at is null and t.created_at >= jkt(w, '00:00') and t.created_at < jkt(w + 7, '00:00') group by 1) x),
    'per_lini_minggu_sebelumnya', (select coalesce(jsonb_object_agg(cat, jsonb_build_object('layanan', n, 'omzet', rp)), '{}') from (
                  select ti.category as cat, count(*) as n, sum(ti.net_amount) as rp
                  from transaction_items ti join transactions t on t.id = ti.transaction_id
                  where t.voided_at is null and t.created_at >= jkt(w - 7, '00:00') and t.created_at < jkt(w, '00:00') group by 1) x),
    -- bahan diagnosis: hari mana yang lemah, capster mana yang jarang menawarkan paket/tambahan, pelanggan lama yang hilang
    'potong_per_hari', (select jsonb_agg(jsonb_build_object('hari', (array['Sen','Sel','Rab','Kam','Jum','Sab','Min'])[i], 'potong', n,
                          'potong_minggu_sebelumnya', p) order by i) from (
                  select extract(isodow from d)::int as i,
                         count(*) filter (where c.day = d) as n, count(*) filter (where c.day = d - 7) as p
                  from (select g::date as d from generate_series(w, w + 6, interval '1 day') g) g left join (
                    select (t.created_at at time zone 'Asia/Jakarta')::date as day
                    from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id
                    where t.voided_at is null and s.category = 'barbershop'
                      and (s.name ilike '%groom%' or s.name in ('Essential Cut', 'Potong Rambut', 'Kids Cut'))
                      and t.created_at >= jkt(w - 7, '00:00') and t.created_at < jkt(w + 7, '00:00')) c on c.day in (d, d - 7)
                  group by d) x),
    'per_capster', (select coalesce(jsonb_agg(jsonb_build_object('capster', nm, 'potong', n, 'paket_groom', g, 'dengan_tambahan_pijat_atau_retail', a) order by n desc), '[]') from (
                  select st.name as nm, count(*) as n, count(*) filter (where s.name ilike '%groom%') as g,
                         count(*) filter (where exists (select 1 from transaction_items x where x.transaction_id = t.id and x.category in ('massage', 'retail'))) as a
                  from transaction_items ti join transactions t on t.id = ti.transaction_id join services s on s.id = ti.service_id join staff st on st.id = ti.staff_id
                  where t.voided_at is null and s.category = 'barbershop'
                    and (s.name ilike '%groom%' or s.name in ('Essential Cut', 'Potong Rambut', 'Kids Cut'))
                    and t.created_at >= jkt(w, '00:00') and t.created_at < jkt(w + 7, '00:00') group by st.name) x),
    'pelanggan', (select jsonb_build_object(
                    'datang', count(distinct t.customer_id),
                    'kunjungan_pertama', count(distinct t.customer_id) filter (where not exists (select 1 from transactions p
                        where p.customer_id = t.customer_id and p.voided_at is null and p.created_at < jkt(w, '00:00'))),
                    'perlu_follow_up_saat_ini', (select count(*) from (select 1 from transactions x join customers c on c.id = x.customer_id
                        where x.voided_at is null and c.deleted_at is null group by x.customer_id
                        having max(x.created_at) < now() - make_interval(weeks => (select churn_weeks from settings))) z),
                    'batas_follow_up_minggu', (select churn_weeks from public_settings))
                  from transactions t where t.voided_at is null and t.customer_id is not null
                    and t.created_at >= jkt(w, '00:00') and t.created_at < jkt(w + 7, '00:00')),
    'notulen_rapat_sebelumnya', (select notes from ai_meetings where week = w - 7),
    'selisih_kas', (select coalesce(jsonb_agg(jsonb_build_object('tanggal', date, 'selisih', difference) order by date), '[]')
                    from cash_closings where date between w and w + 6 and coalesce(difference, 0) <> 0),
    'stok_menipis', (select coalesce(jsonb_agg(name order by name), '[]') from stock_levels
                     where active and kind = 'consumable' and reorder_at > 0 and qty <= reorder_at),
    'konteks', 'Barbershop + pijat (pijat tidak dipromosikan di Instagram; nail art belum buka). Harga potong Rp50.000. '
               || 'Voucher SENKAMWA/SENKAMIG Rp5.000 Senin–Kamis s/d 30 Nov. Komisi capster 50% harga normal, tidak dipotong HPP.'
  );
end $$;
revoke execute on function ai_weekly_facts() from public, anon, authenticated;

-- Senin 08.20 WIB: minta server menulis analisis (URL diturunkan dari notify_url; kosong = dilewati, mis. lokal tanpa server).
create function kick_ai_weekly() returns void language plpgsql security definer set search_path = public, extensions as $$
declare url text; secret text;
begin
  select replace(value, '/api/notifications/dispatch', '/api/ai/weekly') into url from app_config where key = 'notify_url';
  if url is null then return; end if;
  select value into secret from app_config where key = 'push_secret';
  perform net.http_post(url := url, body := '{}'::jsonb, timeout_milliseconds := 300000,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', coalesce(secret, '')));
end $$;
revoke execute on function kick_ai_weekly() from public, anon, authenticated;
select cron.schedule('gb-ai-mingguan', '20 1 * * 1', $$select public.kick_ai_weekly()$$);  -- Senin 08.20 WIB
