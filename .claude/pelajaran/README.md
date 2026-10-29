# Buku pelajaran D'Pras

Tempat semua skill (dpras-bisnis, rapat-manajemen, dpras-digital-marketing) dan agen rapat (dpras-cfo, dpras-operasional,
dpras-marketing, dpras-sdm) **belajar dari pengalaman dan data lapangan**. Dibaca sebelum bekerja, ditambah setelah ada
pelajaran. Tujuannya sederhana: kesalahan yang sama tidak terulang, dan yang terbukti berhasil dipakai lagi.

| File | Isi |
| --- | --- |
| `hasil-keputusan.md` | Keputusan/kampanye yang sedang berjalan + tanggal & ukuran evaluasinya, lalu hasil nyatanya |
| `marketing.md` | Copy, kanal, promosi, respons pelanggan |
| `operasional.md` | Kapasitas, jadwal, stok, alur booking, layanan |
| `keuangan.md` | Harga, margin, biaya, skema upah dari sisi studio |
| `sdm.md` | Staf, rekrutmen, upah dari sisi staf, komunikasi dengan staf |
| `sistem.md` | Aplikasi, data, notifikasi, otomasi |

## Kapan menulis
1. **Owner mengoreksi atau menolak** sesuatu (kalimat, angka, rekomendasi, desain) → tulis apa yang ditolak, alasannya,
   dan penggantinya.
2. **Data lapangan menunjukkan hasil** (KPI tercapai/gagal, kampanye jalan/tidak, angka berbeda dari asumsi) →
   tulis angkanya, bukan kesannya.
3. **Asumsi ternyata salah** saat dicek ke prod (mis. "kontak belum kenal D'Pras" padahal dari WA D'Pras).
4. **Tanggal evaluasi di `hasil-keputusan.md` jatuh tempo** → tarik datanya, isi kolom hasil, lalu pindahkan pelajarannya
   ke file bidangnya.

Tidak ditulis: hal yang hanya berlaku di satu percakapan, rahasia (token, kata sandi, nomor pribadi), data pribadi pelanggan.

## Format satu pelajaran
```
- **[tanggal] Judul singkat** — Yang terjadi (dengan angka/sumber). → Pelajaran. → Cara pakai lain kali.
  Sumber: koreksi owner | data prod (query/tanggal) | hasil kampanye. Status: berlaku | diganti oleh [tanggal].
```
Pelajaran yang terbantah data baru **tidak dihapus**: tandai "diganti oleh" supaya alasan perubahannya tetap terbaca.

## Cara membaca
Sebelum bekerja, baca file bidang yang relevan dan cek `hasil-keputusan.md` untuk evaluasi yang sudah jatuh tempo.
Bila ada yang jatuh tempo, sampaikan ke owner dan tawarkan mengisinya dengan data prod (baca-saja).
Bila pelajaran bertentangan dengan permintaan owner sekarang, ikuti owner dan sebutkan pelajarannya dalam satu kalimat.
