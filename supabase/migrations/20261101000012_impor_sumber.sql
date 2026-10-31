-- Audit BOOK-4 (1 Nov): impor kontak tidak mengisi "Tahu dari mana?" (197 kontak 26 Okt → sumber kosong).
-- Layar impor kini memilih sumber untuk satu batch; dikirim per baris (x.source), divalidasi check constraint customers.source.
do $$
declare def text; old text;
begin
  select pg_get_functiondef('import_customers(jsonb)'::regprocedure) into def; old := def;
  def := replace(def, $a$insert into customers (name, whatsapp, notes) values (trim(x ->> 'name'), wa, coalesce(trim(x ->> 'notes'), ''));$a$,
    $a$insert into customers (name, whatsapp, notes, source) values (trim(x ->> 'name'), wa, coalesce(trim(x ->> 'notes'), ''), nullif(x ->> 'source', ''));$a$);
  if def = old then raise exception 'Patch import_customers tidak menemukan teks'; end if;
  execute def;
end $$;
