-- Koreksi: pengeluaran dari laci yang lupa dicatat sebelum tutup kasir. Manajer boleh mencatatnya ke tanggal yang sudah
-- ditutup, lalu menutup ulang kasir tanggal itu (penutupan terakhir yang dipakai laporan & saldo laci berikutnya).
-- Kasir tetap tidak bisa (tutup kasir buta tidak boleh diubah kasir sesudahnya).
do $$
declare def text; old text;
begin
  select pg_get_functiondef('add_expense'::regproc) into def;
  old := def;
  def := replace(def, $a$  if p_source = 'laci' and exists (select 1 from cash_closings where date = d) then$a$,
                      $a$  if p_source = 'laci' and r <> 'manager' and exists (select 1 from cash_closings where date = d) then$a$);
  if def = old then raise exception 'Patch add_expense tidak menemukan teks'; end if;
  execute def;
end $$;
