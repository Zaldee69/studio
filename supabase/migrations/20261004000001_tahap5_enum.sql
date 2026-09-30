-- Tahap 5: status "Tidak datang". Terpisah karena nilai enum baru tidak bisa dipakai di transaksi yang sama.
alter type appt_status add value if not exists 'no_show' after 'paid';
