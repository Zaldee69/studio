-- Audit KPI-7 (1 Nov): KPI campaign, cek tengah minggu, rapor capster & rapat AI mengenali "potong" dan "naik paket"
-- dari nama layanan (%groom%, 'Essential Cut', 'Potong Rambut', 'Kids Cut') → ganti nama layanan = angka rusak.
-- Penanda di tabel services (diatur di Pengaturan → Layanan); diisi dari aturan nama yang berlaku sekarang.
alter table services add column is_cut boolean not null default false, add column is_upgrade boolean not null default false;
comment on column services.is_cut is 'Dihitung sebagai potong (target Sen–Kam, rapor capster, campaign).';
comment on column services.is_upgrade is 'Paket naik kelas (mis. Fresh/Relax/Signature Groom).';
update services set is_cut = (category = 'barbershop' and (name ilike '%groom%' or name in ('Essential Cut', 'Potong Rambut', 'Kids Cut'))),
                    is_upgrade = (category = 'barbershop' and name ilike '%groom%')
where true;

do $$
declare
  fn text; def text; old text; i int;
  patches text[][] := array[
    array['ai_weekly_facts', $a$(s.name ilike '%groom%' or s.name in ('Essential Cut', 'Potong Rambut', 'Kids Cut'))$a$, $a$s.is_cut$a$],
    array['ai_weekly_facts', $a$filter (where s.name ilike '%groom%')$a$, $a$filter (where s.is_upgrade)$a$],
    array['alert_midweek', $a$is_cut_service(s.name)$a$, $a$s.is_cut$a$],
    array['campaign_report_data', $a$s.name ilike '%groom%' as upgrade$a$, $a$s.is_upgrade as upgrade$a$],
    array['campaign_report_data', $a$(s.name ilike '%groom%' or s.name in ('Essential Cut', 'Potong Rambut', 'Kids Cut'))$a$, $a$s.is_cut$a$],
    array['staff_weekly_report', $a$s.name ilike '%groom%' as groom$a$, $a$s.is_upgrade as groom$a$],
    array['staff_weekly_report', $a$is_cut_service(s.name)$a$, $a$s.is_cut$a$]
  ];
begin
  for i in 1 .. array_length(patches, 1) loop
    fn := patches[i][1];
    select pg_get_functiondef(p.oid) into def from pg_proc p where p.proname = fn and p.pronamespace = 'public'::regnamespace;
    old := def;
    def := replace(def, patches[i][2], patches[i][3]);
    if def = old then raise exception 'Patch % (%) tidak menemukan teks', i, fn; end if;
    execute def;
  end loop;
end $$;
drop function is_cut_service(text);
