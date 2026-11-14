-- Void bisa menandai "tidak ada uang dikembalikan" (mis. salah metode bayar, pelanggan bayar ulang).
-- Default true = perilaku lama. false = refund_date tidak diisi, kas diharapkan tidak terpotong.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('void_transaction(uuid,text)'::regprocedure) into def;
  old := def;
  def := replace(def, 'void_transaction(p_id uuid, p_reason text)', 'void_transaction(p_id uuid, p_reason text, p_refund boolean default true)');
  if def = old then raise exception 'Patch void_transaction: signature tidak ditemukan'; end if;
  old := def;
  def := replace(def, 'refund_date = case when (', 'refund_date = case when p_refund and (');
  if def = old then raise exception 'Patch void_transaction: refund_date tidak ditemukan'; end if;
  drop function void_transaction(uuid, text);
  execute def;
end $$;
revoke execute on function void_transaction(uuid, text, boolean) from public, anon;
grant execute on function void_transaction(uuid, text, boolean) to authenticated;
