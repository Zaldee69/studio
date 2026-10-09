// Kategori layanan/staf/kursi. Pijat hanya lewat kasir/WA (tidak dibooking online) & tidak ikut diskon paket gabungan.
export type Cat = "barbershop" | "nail" | "massage";
export const CATS: readonly Cat[] = ["barbershop", "nail", "massage"];
/** Kategori yang ditawarkan di booking online & halaman publik. */
export type OnlineCat = "barbershop" | "nail";
export const ONLINE_CATS: readonly OnlineCat[] = ["barbershop", "nail"];
export const isOnlineCat = (c: string): c is OnlineCat => (ONLINE_CATS as readonly string[]).includes(c);
/** Lini yang tampil "Segera hadir" di halaman publik: tanpa menu & reservasi online. Hapus dari daftar saat diluncurkan.
 *  Kasir tetap bisa mencatat layanannya (mis. uji coba / soft opening). */
export const COMING_SOON: readonly string[] = ["nail", "lashes"];

export const CAT_NAME: Record<Cat, string> = { barbershop: "Barbershop", nail: "Nail Art", massage: "Pijat" };
export const STAFF_TITLE: Record<Cat, string> = { barbershop: "Kapster", nail: "Nail artist", massage: "Terapis pijat" };
/** Warna chip kategori (latar, teks). */
export const CAT_TONE: Record<Cat, { bg: string; fg: string }> = {
  barbershop: { bg: "#E6E3F7", fg: "#3A2F8F" },
  nail: { bg: "#F7E3EC", fg: "#8A2352" },
  massage: { bg: "#E2F1EA", fg: "#1F5E44" },
};
