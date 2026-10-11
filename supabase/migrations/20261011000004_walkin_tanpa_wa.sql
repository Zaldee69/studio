-- Walk-in tanpa No. WA tidak lagi dibuatkan data pelanggan dari nama saja: nama yang diisi asal-asalan oleh kasir mengotori
-- daftar pelanggan, CRM, dan statistik kunjungan. Pelanggan baru = wajib No. WA (+ nama). Tanpa WA = walk-in (customer_id null).
do $$
declare def text; old text;
begin
  select pg_get_functiondef('create_booking_admin'::regproc) into def;
  old := def;
  def := replace(def, $a$  if cid is null and length(trim(coalesce(p_name, ''))) > 0 then
    insert into customers$a$, $a$  if cid is null and wa is not null and length(trim(coalesce(p_name, ''))) > 0 then
    insert into customers$a$);
  if def = old then raise exception 'Patch create_booking_admin tidak menemukan teks'; end if;
  execute def;
end $$;
