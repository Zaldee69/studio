-- Kasir boleh memilih sumber pembayaran (laci / kas toko / transfer) saat mencatat pengeluaran.
-- Batas kas kecil hanya untuk laci. Sumber non-laci oleh kasir: foto nota wajib berapa pun jumlahnya.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('add_expense'::regproc) into def;
  old := def;
  def := replace(def, $a$    if p_source <> 'laci' then raise exception 'Kasir hanya mencatat pengeluaran dari laci kas'; end if;
    if p_amount > st.petty_cash_limit then$a$,
  $a$    if p_source <> 'laci' and coalesce(p_receipt_path, '') = '' then raise exception 'Foto nota wajib untuk pengeluaran non-laci'; end if;
    if p_source = 'laci' and p_amount > st.petty_cash_limit then$a$);
  if def = old then raise exception 'Patch add_expense tidak menemukan teks'; end if;
  execute def;
end $$;
