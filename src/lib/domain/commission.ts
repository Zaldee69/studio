// HPP & komisi. Cermin service_hpp(), service_margins dan commission_lines() di SQL — ubah keduanya bersamaan.

/** HPP layanan = Σ qty × unit_cost, dibulatkan ke rupiah (setengah ke atas). */
export function serviceHpp(materials: { qty: number; unitCost: number }[]): number {
  return Math.round(materials.reduce((a, m) => a + m.qty * m.unitCost, 0));
}

/** Ringkasan resep (4.2): margin kotor, komisi staf per layanan, laba kontribusi toko. HPP dipotong dari dasar komisi hanya bila aturan berlaku (settings.commission_deduct_hpp). */
export function serviceMargin(price: number, hpp: number, pct: number, deductHpp = true) {
  const margin = price - hpp;
  const commission = itemCommission(price, deductHpp ? hpp : 0, pct);
  return {
    margin, marginPct: price > 0 ? Math.round((margin * 1000) / price) / 10 : 0,
    commission, contribution: margin - commission,
  };
}

/** Komisi item layanan = round(max(0, net − hpp) × pct%). Dibulatkan per item. */
export function itemCommission(netAmount: number, hpp: number, pct: number): number {
  return Math.round((Math.max(0, netAmount - hpp) * pct) / 100);
}

/** Tingkat upsell (%) = transaksi berisi item staf dgn from_upsell ÷ transaksi berisi item staf. */
export function upsellRate(items: { tx: string; fromUpsell: boolean }[]): number {
  const all = new Set(items.map((i) => i.tx));
  const up = new Set(items.filter((i) => i.fromUpsell).map((i) => i.tx));
  return all.size ? Math.round((up.size * 1000) / all.size) / 10 : 0;
}
