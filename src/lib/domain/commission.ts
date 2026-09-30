// HPP, komisi, gaji & evaluasi. Cermin service_hpp(), service_margins, commission_lines(), commission_live(),
// staff_leaderboard() dan staff_annual_review() di SQL — ubah keduanya bersamaan.

/** HPP layanan = Σ qty × unit_cost, dibulatkan ke rupiah (setengah ke atas). */
export function serviceHpp(materials: { qty: number; unitCost: number }[]): number {
  return Math.round(materials.reduce((a, m) => a + m.qty * m.unitCost, 0));
}

/** Ringkasan resep (4.2): margin kotor, komisi staf per layanan, laba kontribusi toko. */
export function serviceMargin(price: number, hpp: number, pct: number) {
  const margin = price - hpp;
  const commission = itemCommission(price, hpp, pct);
  return {
    margin, marginPct: price > 0 ? Math.round((margin * 1000) / price) / 10 : 0,
    commission, contribution: margin - commission,
  };
}

/** Komisi item layanan = round(max(0, net − hpp) × pct%). Dibulatkan per item. */
export function itemCommission(netAmount: number, hpp: number, pct: number): number {
  return Math.round((Math.max(0, netAmount - hpp) * pct) / 100);
}

/** Komisi item ritel untuk staf penjual = round(net × pct%). Tanpa penjual → 0. */
export function retailCommission(netAmount: number, pct: number, sellerId: string | null): number {
  return sellerId && pct > 0 ? Math.round((netAmount * pct) / 100) : 0;
}

export type PayItem = { netAmount: number; hpp: number; retail?: boolean; sellerId?: string | null };

/**
 * Gaji satu staf satu bulan (4.6). Subsidi jaring pengaman dihitung SEBELUM penyesuaian:
 * bonus tidak mengurangi subsidi, potongan tidak menambah subsidi.
 */
export function monthlyPay(items: PayItem[], pct: number, minMonthlyPay: number, opts: { retailPct?: number; adjustments?: number } = {}) {
  const service = items.filter((i) => !i.retail).reduce((a, i) => a + itemCommission(i.netAmount, i.hpp, pct), 0);
  const retail = items.filter((i) => i.retail).reduce((a, i) => a + retailCommission(i.netAmount, opts.retailPct ?? 0, i.sellerId ?? null), 0);
  const commission = service + retail;
  const subsidy = Math.max(0, minMonthlyPay - commission);
  const adjustments = opts.adjustments ?? 0;
  return { commissionService: service, commissionRetail: retail, commission, subsidy, adjustments, totalPay: commission + subsidy + adjustments };
}

/** 4.7 Peringkat: pendapatan jasa bersih menurun; seri → jumlah layanan, lalu nama. */
export function rankStaff<T extends { name: string; revenue: number; count: number }>(rows: T[]): (T & { rank: number })[] {
  return [...rows]
    .sort((a, b) => b.revenue - a.revenue || b.count - a.count || a.name.localeCompare(b.name, "id"))
    .map((r, i) => ({ ...r, rank: i + 1 }));
}

/** Tingkat upsell (%) = transaksi berisi item staf dgn from_upsell ÷ transaksi berisi item staf. */
export function upsellRate(items: { tx: string; fromUpsell: boolean }[]): number {
  const all = new Set(items.map((i) => i.tx));
  const up = new Set(items.filter((i) => i.fromUpsell).map((i) => i.tx));
  return all.size ? Math.round((up.size * 1000) / all.size) / 10 : 0;
}

const dayNum = (d: string) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10)) / 86_400_000;
/**
 * Pelanggan kembali (%) = pelanggan (non walk-in) yang datang lagi ke staf yang sama ≤ `windowDays` hari setelah
 * kunjungan pada tahun itu. `visits` = tanggal Asia/Jakarta (YYYY-MM-DD); kunjungan sesudah tahun ikut dilihat.
 */
export function returnRate(visits: { customerId: string | null; date: string }[], year: number, windowDays = 60): number {
  const by = new Map<string, number[]>();
  for (const v of visits) if (v.customerId) by.set(v.customerId, [...(by.get(v.customerId) ?? []), dayNum(v.date)]);
  let custs = 0, back = 0;
  for (const [, ds] of by) {
    const inYear = ds.filter((d) => new Date(d * 86_400_000).getUTCFullYear() === year);
    if (!inYear.length) continue;
    custs++;
    if (inYear.some((d) => ds.some((e) => e > d && e - d <= windowDays))) back++;
  }
  return custs ? Math.round((back * 1000) / custs) / 10 : 0;
}
