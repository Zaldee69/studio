-- Rapat 28 Okt (pilihan C owner): layanan tambahan barbershop dinamai menurut manfaat (tanpa klaim medis) dan harga
-- masker/shave naik mendekati nilai waktu kursi; Signature 100K jadi terlihat hemat dibanding Fresh + masker + shave (120K).
update services set name = 'Scalp Refresh', public_description = 'Tambahan: tonik & pijat kulit kepala.'
where name = 'Hair tonic & scalp treatment';
update services set name = 'Masker Wajah', price = 25000, public_description = 'Tambahan: masker wajah, didiamkan ±10 menit.'
where name = 'Face mask';
update services set name = 'Hot Towel Shave', price = 35000, public_description = 'Tambahan: cukur dengan pisau & handuk hangat.'
where name = 'Hot towel shave';
-- Cukur jenggot pakai clipper (beda dari shave pakai pisau). ponytail: hanya baris prod (20K); data contoh lokal (45K) dipakai test.
update services set name = 'Rapikan Jenggot', public_description = 'Rapikan jenggot/kumis dengan clipper.'
where name = 'Cukur Jenggot' and price = 20000;
-- Keputusan rapat 19 Okt: Essential Cut Rp50.000 (draf rilis masih 45K) — tidak ada layanan utama di bawah 50K.
update services set price = 50000 where name = 'Essential Cut' and price = 45000 and not active;
update services set public_description = 'Semua di Relax Groom · masker wajah · hot towel shave.' where name = 'Signature Groom';
-- Owner 28 Okt: Black Coloring tetap dijual (tanda "dihentikan saat rilis" terpasang tanpa keputusan).
update services set release_action = null, public_description = 'Menghitamkan rambut dan menutup uban.'
where name = 'Black Coloring' and release_action = 'retire';
