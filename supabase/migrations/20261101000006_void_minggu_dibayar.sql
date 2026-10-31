-- Audit UANG-3 (1 Nov, pilihan A): komisi minggu yang sudah ditutup/dibayar dibekukan, jadi void transaksi dari minggu itu
-- membuat komisinya tidak pernah ditarik. Void ditolak bila staf di transaksi itu sudah ditutup minggunya.
-- ponytail: tolak dulu; potongan otomatis ke minggu berikutnya menyusul bersama kasbon terbawa (UANG-5).
do $$
declare def text; old text;
begin
  select pg_get_functiondef('void_transaction(uuid,text)'::regprocedure) into def;
  old := def;
  def := replace(def, $a$  update transactions set voided_at = now(), void_reason = trim(p_reason),$a$,
    $a$  if exists (select 1 from transaction_items ti join commission_week_pays w on w.staff_id = ti.staff_id
             and w.week_start = date_trunc('week', (tx_at at time zone 'Asia/Jakarta')::date)::date
             where ti.transaction_id = p_id) then
    raise exception 'Komisi minggu itu sudah dibayar ke %. Bicarakan potongan dengan staf dulu — void tidak bisa dilakukan.',
      (select string_agg(distinct s.name, ', ') from transaction_items ti join staff s on s.id = ti.staff_id
         join commission_week_pays w on w.staff_id = ti.staff_id and w.week_start = date_trunc('week', (tx_at at time zone 'Asia/Jakarta')::date)::date
       where ti.transaction_id = p_id);
  end if;
  update transactions set voided_at = now(), void_reason = trim(p_reason),$a$);
  if def = old then raise exception 'Patch void_transaction tidak menemukan teks'; end if;
  execute def;
end $$;
