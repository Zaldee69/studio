// Kategori layanan/staf/kursi. Pijat tidak ikut diskon paket gabungan (paket = barbershop + nail).
export type Cat = "barbershop" | "nail" | "massage";
export const CATS: readonly Cat[] = ["barbershop", "nail", "massage"];
/** Kategori yang ditawarkan di booking online & halaman publik. */
export type OnlineCat = "barbershop" | "nail" | "massage";
export const ONLINE_CATS: readonly OnlineCat[] = ["barbershop", "nail", "massage"];
export const isOnlineCat = (c: string): c is OnlineCat => (ONLINE_CATS as readonly string[]).includes(c);
/** Lini yang tampil "Segera hadir" di halaman publik: tanpa menu & reservasi online. Hapus dari daftar saat diluncurkan.
 *  Kasir tetap bisa mencatat layanannya (mis. uji coba / soft opening). */
export const COMING_SOON: readonly string[] = ["nail", "lashes"];

export const CAT_NAME: Record<Cat, string> = { barbershop: "Barbershop", nail: "Nail Art", massage: "Pijat" };
export const STAFF_TITLE: Record<Cat, string> = { barbershop: "Capster", nail: "Nail artist", massage: "Terapis pijat" };
/** Warna chip kategori (latar, teks). */
export const CAT_TONE: Record<Cat, { bg: string; fg: string }> = {
  barbershop: { bg: "#B1DDF5", fg: "#10304A" },
  nail: { bg: "#F2A3BF", fg: "#5A0F2E" },
  massage: { bg: "#86D4CC", fg: "#0A3B36" },
};
/** Staf bukan layanan (mis. kasir) tak punya CAT_TONE/CAT_NAME; pakai fallback netral. */
export const toneOf = (c: string) => (CAT_TONE as Record<string, { bg: string; fg: string }>)[c] ?? { bg: "#E4E6EA", fg: "#454B55" };
export const catNameOf = (c: string) => (c === "kasir" ? "Kasir" : (CAT_NAME as Record<string, string>)[c] ?? c);
