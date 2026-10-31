-- Audit BOOK-6 (1 Nov): booking yang statusnya menggantung (Terjadwal/Datang/Dilayani dari hari sebelumnya, atau menunggu
-- konfirmasi yang jamnya sudah lewat) tidak pernah ditutup — prod: 2 walk-in "Terjadwal" sejak 3 Okt. Mengotori jadwal,
-- rasio booking, dan antrean. Alert pagi (Telegram) menyebut jumlah per tanggal; manajer yang memutuskan (tidak diubah otomatis).
create function alert_stale_appointments() returns void
language plpgsql security definer set search_path = public as $$
declare lines text; n int;
begin
  select string_agg(format('• %s: %s', fmt_tgl(d), x), E'\n' order by d), sum(c)::int into lines, n from (
    select (start_at at time zone 'Asia/Jakarta')::date as d, count(*) as c,
           string_agg(distinct case status when 'booked' then 'Terjadwal' when 'arrived' then 'Datang' when 'in_service' then 'Dilayani'
                                           else 'Menunggu konfirmasi' end, ', ') || ' (' || count(*) || ')' as x
    from appointments
    where (status in ('booked', 'arrived', 'in_service') and start_at < jkt(jkt_today(), '00:00'))
       or (status = 'pending_review' and start_at < now())
    group by 1) s;
  if n > 0 then
    perform safe_alert(format(E'🗂️ %s booking statusnya menggantung:\n%s\nBuka Jadwal di tanggal itu → tandai Selesai/bayar, Tidak datang, atau batalkan dengan alasan.', n, lines));
  end if;
end $$;
revoke execute on function alert_stale_appointments() from public, anon, authenticated;

do $$
declare def text; old text;
begin
  select pg_get_functiondef('alert_morning'::regproc) into def; old := def;
  def := replace(def, $a$  perform alert_low_stock();$a$, $a$  perform alert_low_stock();
  perform alert_stale_appointments();$a$);
  if def = old then raise exception 'Patch alert_morning tidak menemukan teks'; end if;
  execute def;
end $$;
