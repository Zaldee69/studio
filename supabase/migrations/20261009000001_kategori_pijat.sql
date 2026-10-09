-- Kategori ketiga: pijat (D'Pras Massage). Nilai enum baru harus di-commit dulu sebelum dipakai → file terpisah.
alter type staff_category add value if not exists 'massage';
alter type service_category add value if not exists 'massage' before 'retail';
