-- Keputusan owner 28 Okt: voucher/promo hanya bisa dipakai lewat booking online (membatalkan kode voucher di kasir dari
-- 20261026000001). Voucher yang menempel di booking tetap otomatis dipotong saat dibayar di kasir.
drop function voucher_check_kasir(text, uuid[], uuid);

do $$
declare def text; old text;
begin
  select pg_get_functiondef('checkout(jsonb)'::regprocedure) into def;
  old := def;
  -- ponytail: sisa alur voucher kasir di checkout dibiarkan mati di balik raise ini; bersihkan bila checkout ditulis ulang
  def := replace(def, $a$    wvc := voucher_check(p ->> 'voucher_code',$a$,
    $a$    raise exception 'Voucher hanya berlaku lewat booking online di dprasstudio.com';
    wvc := voucher_check(p ->> 'voucher_code',$a$);
  if def = old then raise exception 'Patch checkout tidak menemukan teks'; end if;
  execute def;
end $$;
