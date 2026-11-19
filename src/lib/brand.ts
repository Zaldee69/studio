// Nama merek di kode (fallback, metadata, logo). Nama yang tampil ke pelanggan diambil dari Pengaturan → Umum
// (settings.shop_name) bila ada. Ganti di sini + migrasi settings bila merek berubah lagi.
// Whitelabel: tiap image klien di-build dengan NEXT_PUBLIC_BRAND* sendiri (nilai NEXT_PUBLIC_ beku saat build). Default = D'Pras.
export const BRAND = process.env.NEXT_PUBLIC_BRAND || "D'Pras Studio";
export const BRAND_INITIALS = process.env.NEXT_PUBLIC_BRAND_INITIALS || "DP";
export const BRAND_TAGLINE = process.env.NEXT_PUBLIC_BRAND_TAGLINE || "For Every You.";
export const BRAND_LINES = process.env.NEXT_PUBLIC_BRAND_LINES || "Barbershop • Nail Art • Lashes";
