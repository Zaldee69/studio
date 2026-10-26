-- Kontak WA yang diimpor tanpa nama tersimpan sebagai "No Name". Blast promosi menyapa mereka "Kak" (bukan "No"),
-- sama dengan aturan firstName() di src/lib/domain/customer.ts.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('send_campaign(uuid)'::regprocedure) into def;
  old := def;
  def := replace(def, $a$replace(c.message, '{nama}', split_part(trim(a.name), ' ', 1))$a$,
    $a$replace(c.message, '{nama}', case when trim(a.name) ~* '^no name$' then 'Kak' else split_part(trim(a.name), ' ', 1) end)$a$);
  if def = old then raise exception 'Patch send_campaign tidak menemukan teks'; end if;
  execute def;
end $$;
