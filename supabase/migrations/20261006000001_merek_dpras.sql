-- Merek sementara: "Groom & Bloom" → "D'Pras Barbershop". Label diskon paket barbershop + nail jadi netral
-- ("Diskon paket 10%") supaya tidak ikut berganti bila merek berubah lagi.
alter table settings alter column shop_name set default 'D''Pras Barbershop';
update settings set shop_name = 'D''Pras Barbershop' where shop_name = 'Groom & Bloom';
-- alamat toko; Instagram lama dikosongkan (isi akun baru dari Pengaturan → Umum)
update settings set shop_address = 'Cimanggis Golf Estate (Ruko Emerald), Cimanggis, Kota Depok, Jawa Barat' where shop_address in ('', 'Jl. Contoh No. 1, Jakarta');
update settings set shop_instagram = '' where shop_instagram = '@groomandbloom';
update settings set wa_followup_template = replace(wa_followup_template, 'Groom & Bloom', 'D''Pras Barbershop')
  where wa_followup_template like '%Groom & Bloom%';
alter table settings alter column wa_followup_template set default
  'Halo {nama}! Sudah cukup lama nih belum mampir ke D''Pras Barbershop. Minggu ini masih ada slot kosong — mau kami bantu booking?';

-- checkout(): label diskon pada transaksi baru (definisi terakhir dari tahap4_fase2, hanya teks labelnya yang diganti)
do $$
declare def text := pg_get_functiondef('public.checkout(jsonb)'::regprocedure);
begin
  if position('''Groom & Bloom ''' in def) = 0 then raise exception 'Label diskon di checkout() tidak ditemukan'; end if;
  execute replace(def, '''Groom & Bloom ''', '''Diskon paket ''');
end $$;
-- Transaksi lama tidak diubah (catatan keuangan; transaksi void pun dikunci trigger) — struk lama tetap berlabel lama.
