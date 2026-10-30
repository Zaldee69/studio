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

/** Isi {nama} = nama depan ("Kak" bila belum diketahui); "Kak {nama}" tanpa nama → "Kak", bukan "Kak Kak". Sama dengan fill_nama() di DB. */
export function fillNama(text: string, name: string): string {
  const f = firstName(name);
  return text.replaceAll("Kak {nama}", f ? `Kak ${f}` : "Kak").replaceAll("{nama}", f || "Kak");
}

/** Tautan follow-up wa.me dari template follow-up. */
export function followupLink(whatsapp: string, template: string, name: string): string {
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(fillNama(template, name))}`;
}

export type Loyalty = "baru" | "jarang" | "langganan" | "biasa";
/** Penanda di kasir: baru = belum pernah bayar; jarang = terakhir > 8 minggu lalu; langganan = ≥3 kunjungan & terakhir ≤ 6 minggu. */
export function loyalty(visits: number, lastVisitAt: string | null, now: Date = new Date()): Loyalty {
  if (!visits || !lastVisitAt) return "baru";
  const weeks = (now.getTime() - new Date(lastVisitAt).getTime()) / (7 * DAY);
  if (weeks > 8) return "jarang";
  return visits >= 3 && weeks <= 6 ? "langganan" : "biasa";
}
