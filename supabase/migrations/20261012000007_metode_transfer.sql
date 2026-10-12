-- Metode bayar transfer bank (nilai enum baru dipakai di migrasi berikutnya — tidak bisa dalam transaksi yang sama).
alter type pay_method add value if not exists 'transfer';
alter type pay_method add value if not exists 'deposit_transfer';
