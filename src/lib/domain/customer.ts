const DAY = 24 * 3600 * 1000;

/** Churn: transaksi terakhir lebih dari churnWeeks minggu lalu. Belum pernah bertransaksi = bukan churn. */
export function isChurn(lastVisitAt: Date | string | null, churnWeeks: number, now: Date = new Date()): boolean {
  if (!lastVisitAt) return false;
  return now.getTime() - new Date(lastVisitAt).getTime() > churnWeeks * 7 * DAY;
}

/** "Tahu D'Pras dari mana?" — kolom customers.source (web = booking online, diisi otomatis). */
export const CUSTOMER_SOURCES = [
  ["instagram", "Instagram"], ["google_maps", "Google Maps"], ["whatsapp", "WhatsApp / pesan promo"], ["teman", "Teman / keluarga"],
  ["lewat", "Lewat depan studio"], ["web", "Website"], ["lainnya", "Lainnya"],
] as const;
export type CustomerSource = (typeof CUSTOMER_SOURCES)[number][0];

/** Nama depan untuk sapaan; "" bila nama belum diketahui (kontak WA impor tanpa nama tersimpan sebagai "No Name"). */
export function firstName(name: string): string {
  const n = name.trim();
  return /^no name$/i.test(n) ? "" : (n.split(/\s+/)[0] ?? "");
}

/** Tautan follow-up wa.me dengan {nama} = nama depan ("Kak" bila nama belum diketahui). */
export function followupLink(whatsapp: string, template: string, name: string): string {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(template.replaceAll("{nama}", firstName(name) || "Kak"))}`;
}
