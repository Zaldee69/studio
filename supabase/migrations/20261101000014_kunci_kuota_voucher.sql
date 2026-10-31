-- Audit UANG-8 (1 Nov): dua booking online bersamaan dengan kode yang sama bisa sama-sama lolos cek kuota
-- (voucher_check sebelum kunci tanggal, baris voucher tidak dikunci) → kuota SENKAMWA (30) bisa terlampaui.
-- Kunci per kode voucher sampai transaksi booking selesai; permintaan kedua menghitung kuota sesudah yang pertama tersimpan.
do $$
declare def text; old text;
begin
  select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = 'book_online' and p.pronamespace = 'public'::regnamespace;
  old := def;
  def := replace(def, $a$  if nullif(trim(coalesce(p ->> 'voucher_code', '')), '') is not null then
    vc := voucher_check($a$, $a$  if nullif(trim(coalesce(p ->> 'voucher_code', '')), '') is not null then
    perform pg_advisory_xact_lock(hashtext('voucher:' || upper(trim(p ->> 'voucher_code'))));
    vc := voucher_check($a$);
  if def = old then raise exception 'Patch book_online tidak menemukan teks'; end if;
  execute def;
end $$;
