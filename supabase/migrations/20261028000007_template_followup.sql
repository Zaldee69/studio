-- Template follow-up baru (nada hangat premium + voucher Senin–Kamis), dan satu aturan isi {nama} untuk semua pesan:
-- nama depan, "Kak" bila belum diketahui, dan "Kak {nama}" tanpa nama → "Kak" (bukan "Kak Kak"). Sama dengan fillNama() di app.
create function fill_nama(p_text text, p_name text) returns text language sql immutable as $$
  select replace(replace(p_text, 'Kak {nama}', case when f = '' then 'Kak' else 'Kak ' || f end), '{nama}', coalesce(nullif(f, ''), 'Kak'))
  from (select case when trim(coalesce(p_name, '')) ~* '^(no name)?$' then '' else split_part(trim(p_name), ' ', 1) end as f) x
$$;

do $$
declare fn text; def text; old text; pat text;
begin
  foreach fn in array array['auto_followup()', 'send_campaign(uuid)'] loop
    select pg_get_functiondef(fn::regprocedure) into def;
    old := def;
    pat := case fn
      when 'auto_followup()' then $p$replace(s.wa_followup_template, '{nama}', case when trim(c.name) ~* '^no name$' then 'Kak' else split_part(trim(c.name), ' ', 1) end)$p$
      else $p$replace(c.message, '{nama}', case when trim(a.name) ~* '^no name$' then 'Kak' else split_part(trim(a.name), ' ', 1) end)$p$ end;
    def := replace(def, pat, case fn when 'auto_followup()' then 'fill_nama(s.wa_followup_template, c.name)' else 'fill_nama(c.message, a.name)' end);
    if def = old then raise exception 'Patch % tidak menemukan teks', fn; end if;
    execute def;
  end loop;
end $$;

update settings set wa_followup_template =
  'Halo Kak {nama}, sudah sebulan sejak kunjungan terakhir Kakak di D''Pras Studio. Bila rambut sudah waktunya dirapikan, kami siap menyambut Kakak. Khusus Senin–Kamis, tunjukkan kode SENKAMWA untuk potongan Rp5.000. Balas pesan ini bila ingin kami bantu atur jadwalnya.'
where wa_followup_template = 'Halo {nama}! Sudah cukup lama nih belum mampir ke D''Pras Barbershop. Minggu ini masih ada slot kosong — mau kami bantu booking?';
