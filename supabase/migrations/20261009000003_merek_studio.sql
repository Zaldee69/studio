-- Merek baru: D'Pras Studio — "For Every You." — Barbershop • Nail Art • Lashes (dokumen strategi brand).
-- Teks halaman publik hanya diganti bila masih teks bawaan, agar suntingan manajer di Pengaturan tidak tertimpa.
alter table settings alter column shop_name set default 'D''Pras Studio';
update settings set shop_name = 'D''Pras Studio' where shop_name in ('D''Pras Barbershop', 'Groom & Bloom');

update settings set tagline = 'For Every You.' where tagline = 'Barbershop & nail spa dalam satu atap';
update settings set hero_title = 'For Every', hero_title_accent = 'You.'
where hero_title = 'Seni merawat diri,' and hero_title_accent = 'berdua.';
update settings set hero_text = 'Barbershop, nail art, dan lashes dalam satu studio — pilih layanan yang sesuai dengan gayamu. Harga jelas, proses nyaman, dikerjakan dengan perhatian pada detail.'
where hero_text = 'Grooming untuk dia, perawatan kuku untuk kamu — di satu ruang yang tenang, dilayani bersamaan.';
update settings set groom_text = 'Potongan rapi dan konsisten, dimulai dari konsultasi gaya. Ukuran dan preferensimu kami catat untuk kunjungan berikutnya.'
where groom_text = 'Potongan presisi, cukur handuk hangat, hair spa. Kapster yang mengingat ukuran clipper Anda.';
update settings set bloom_text = 'Manicure, pedicure, gel, dan nail art sesuai referensimu — harga desain jelas di awal, alat steril di setiap layanan.'
where bloom_text = 'Manicure, pedicure, gel polish, dan nail art — dikerjakan pelan, rapi, dengan alat yang steril.';
update settings set standards = '[
  {"title": "Higienis, setiap hari", "text": "Setiap alat dicuci, direndam disinfektan, lalu disterilkan sesuai jenisnya — tercatat setiap hari."},
  {"title": "Harga jelas di awal", "text": "Harga, add-on, dan perkiraan durasi disampaikan sebelum layanan dimulai."},
  {"title": "Konsultasi dulu", "text": "Referensi dan hasil yang kamu inginkan kami pastikan sebelum mulai, tanpa memaksakan tren."},
  {"title": "Kami mengingat kamu", "text": "Ukuran clipper, warna gel favorit, kulit sensitif — tersimpan untuk kunjungan berikutnya."}
]'::jsonb
where standards @> '[{"title": "Datang berdua"}]';
