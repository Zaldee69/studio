-- Audit tumpang tindih TT-7 (1 Nov): "Booking online minggu ini" di Beranda memakai awal minggu UTC (Senin 07.00 WIB);
-- booking Senin 00.00–07.00 WIB terhitung minggu lalu. Sekarang awal minggu WIB, sama dengan laporan lain.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('funnel_summary(timestamptz)'::regprocedure) into def;
  old := def;
  def := replace(def, $a$DEFAULT date_trunc('week'::text, now())$a$, $a$DEFAULT jkt(date_trunc('week', jkt_today())::date, '00:00')$a$);
  if def = old then raise exception 'Patch funnel_summary tidak menemukan teks'; end if;
  execute def;
end $$;
