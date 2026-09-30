const DAY = 24 * 3600 * 1000;

/** Churn: transaksi terakhir lebih dari churnWeeks minggu lalu. Belum pernah bertransaksi = bukan churn. */
export function isChurn(lastVisitAt: Date | string | null, churnWeeks: number, now: Date = new Date()): boolean {
  if (!lastVisitAt) return false;
  return now.getTime() - new Date(lastVisitAt).getTime() > churnWeeks * 7 * DAY;
}

/** Tautan follow-up wa.me dengan {nama} = nama depan. */
export function followupLink(whatsapp: string, template: string, name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? "";
  return `https://wa.me/${whatsapp}?text=${encodeURIComponent(template.replaceAll("{nama}", first))}`;
}
