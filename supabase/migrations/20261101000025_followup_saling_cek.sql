-- Audit tumpang tindih TT-19 (1 Nov): ajak potong lagi otomatis hanya mengecek follow-up WA manual/otomatis
-- (followup_events), tidak mengecek blast promo → pelanggan bisa menerima blast lalu besoknya pesan otomatis.
-- Sekarang kiriman promo apa pun (blast atau otomatis) dalam jendela follow-up juga dihitung "sudah disapa".
do $$
declare def text; old text;
begin
  select pg_get_functiondef('auto_followup()'::regprocedure) into def;
  old := def;
  def := replace(def,
    $a$    and not exists (select 1 from followup_events f where f.customer_id = c.id and f.created_at > now() - make_interval(days => s.followup_window_days))$a$,
    $a$    and not exists (select 1 from followup_events f where f.customer_id = c.id and f.created_at > now() - make_interval(days => s.followup_window_days))
    and not exists (select 1 from outbound_messages o where o.customer_id = c.id and o.template = 'promo'
                    and o.created_at > now() - make_interval(days => s.followup_window_days))$a$);
  if def = old then raise exception 'Patch auto_followup tidak menemukan teks'; end if;
  execute def;
end $$;
