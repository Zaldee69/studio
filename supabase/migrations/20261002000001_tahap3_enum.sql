-- Tahap 3: status booking online yang menunggu persetujuan toko (online_booking_mode = 'review').
-- Dipisah dari migrasi utama: nilai enum baru harus di-commit sebelum dipakai.
alter type appt_status add value if not exists 'pending_review' before 'booked';
