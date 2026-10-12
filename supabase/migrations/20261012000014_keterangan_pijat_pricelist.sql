-- Keterangan layanan pijat = teks daftar harga cetak D'Pras Massage, termasuk durasi persis seperti tertulis
-- ("1 jam", "±45 menit", "±1,5 jam"). Layanan tanpa durasi di daftar harga tidak menyebut durasi.
-- Hanya mengganti keterangan versi awal (tidak menimpa perubahan manual di Pengaturan → Layanan).
update services s set public_description = v.new from (values
  ('Pijat Fullbody', 'Pijat seluruh badan untuk menghilangkan rasa lelah.', 'Pijat fullbody untuk menghilangkan rasa lelah (1 jam).'),
  ('Pijat Fullbody + Kop', 'Pijat seluruh badan dan terapi kop (cupping kering) untuk relaksasi.', 'Pijat fullbody dan terapi kop, relaksasi menyeluruh (1 jam).'),
  ('Pijat Fullbody + Refleksi', 'Pijat seluruh badan dan refleksi kaki.', 'Pijat fullbody dan refleksi, relaksasi menyeluruh nyaman (1 jam).'),
  ('Pijat Keluhan', 'Pijat terarah untuk keluhan seperti pegal, keseleo, atau sakit pinggang.',
   'Melancarkan peredaran darah, melegakan pernapasan, keseleo, sakit pinggang, tekanan darah tinggi, asam lambung (1 jam).'),
  ('Refleksi', 'Pijat titik-titik pada kaki untuk kebugaran tubuh.', 'Meningkatkan kebugaran tubuh dengan memijat titik penting pada kaki (±45 menit).'),
  ('Bekam (13 titik)', 'Bekam dengan 13 titik.', 'Dengan 13 titik bekam (±45 menit).'),
  ('Tambahan 1 titik bekam', 'Tambahan per titik di luar 13 titik bekam.', 'Tambahan per 1 titik di luar 13 titik bekam.'),
  ('Totok Wajah', 'Totok wajah untuk relaksasi dan meredakan pegal di kepala.', 'Meredakan sakit kepala, stres, dan melancarkan peredaran darah di wajah.'),
  ('Ear Candle', 'Membersihkan telinga dengan lilin.', 'Membersihkan telinga dengan lilin.'),
  ('Paket Bekam + Pijat + Refleksi', 'Paket spesial bekam, pijat fullbody, dan refleksi.', 'Paket spesial bekam + pijat + refleksi — tubuh terasa segar dan enteng maksimal (±1,5 jam).')
) v(name, old, new)
where s.name = v.name and s.category = 'massage' and s.public_description = v.old;
