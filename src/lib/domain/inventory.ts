// Inventaris. Cermin new_unit_cost(), stock_levels, opname_approve(), usage_report() dan shopping_list() di SQL.

export type CostMethod = "weighted_avg" | "last";

/** 4.1 Harga pokok baru saat stok masuk (4 desimal). Stok lama ≤ 0 → harga beli. */
export function newUnitCost(method: CostMethod, oldQty: number, oldCost: number, qty: number, cost: number): number {
  const v = method === "last" || oldQty <= 0 ? cost : (oldQty * oldCost + qty * cost) / (oldQty + qty);
  return Math.round(v * 10_000) / 10_000;
}

export type StockStatus = "reorder" | "low" | "ok";
/** Reorder ≤ ambang · Menipis ≤ 1,5× ambang · Aman. */
export function stockStatus(qty: number, reorderAt: number): StockStatus {
  return qty <= reorderAt ? "reorder" : qty <= reorderAt * 1.5 ? "low" : "ok";
}
export const STOCK_STATUS: Record<StockStatus, { label: string; bg: string; fg: string }> = {
  reorder: { label: "Reorder", bg: "#FFDADA", fg: "#6E1616" },
  low: { label: "Menipis", bg: "#FFF1C2", fg: "#5A4300" },
  ok: { label: "Aman", bg: "#D9F2E1", fg: "#144D2A" },
};

/** Stok melewati ambang reorder oleh satu mutasi (sebelumnya > ambang, sekarang ≤ ambang). */
export const crossesReorder = (before: number, after: number, reorderAt: number) => before > reorderAt && after <= reorderAt;

/** 4.4 Opname: mutasi = counted − system (null = belum dihitung → tanpa mutasi); nilai = diff × harga snapshot. */
export function opnameMoves(lines: { itemId: string; system: number; counted: number | null; unitCost: number }[]) {
  const moves = lines.filter((l) => l.counted !== null && l.counted !== l.system)
    .map((l) => ({ itemId: l.itemId, qty: l.counted! - l.system, value: Math.round((l.counted! - l.system) * l.unitCost) }));
  return { moves, value: Math.round(lines.reduce((a, l) => a + (l.counted === null ? 0 : (l.counted - l.system) * l.unitCost), 0)) };
}

/**
 * 4.5 Pemakaian teoretis vs aktual antara dua opname.
 * Aktual = awal + masuk + penyesuaian − akhir − jual. Ditandai bila |selisih %| > ambang.
 */
export function usageVariance(r: { theoretical: number; start: number; incoming: number; adjust: number; end: number; sold: number },
  thresholdPct: number) {
  const actual = r.start + r.incoming + r.adjust - r.end - r.sold;
  const variance = actual - r.theoretical;
  const pct = r.theoretical > 0 ? Math.round((variance * 1000) / r.theoretical) / 10 : null;
  return { actual, variance, pct, flagged: pct === null ? actual !== 0 : Math.abs((variance * 100) / r.theoretical) > thresholdPct };
}

/** Saran beli = sampai multiplier × ambang, dibulatkan ke atas (kelipatan min order bila ada). */
export function suggestOrder(qty: number, reorderAt: number, multiplier: number, minOrder: number | null = null): number {
  const need = Math.max(0, multiplier * reorderAt - qty);
  return minOrder ? Math.ceil(need / minOrder) * minOrder : Math.ceil(need);
}

/** Pesan WhatsApp ke pemasok untuk daftar belanja. */
export function supplierMessage(supplier: string, shop: string, lines: { name: string; qty: number; unit: string }[]): string {
  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
  return `Halo ${supplier}, kami dari ${shop} mau pesan:\n${lines.map((l) => `- ${l.name} ${fmt(l.qty)} ${l.unit}`).join("\n")}\n\nTerima kasih.`;
}

/** Harga pokok per satuan untuk tampilan: 2–4 desimal bila pecahan (Rp130,34 / Rp1.200). */
export function formatUnitCost(v: number, digits = 2): string {
  return "Rp" + new Intl.NumberFormat("id-ID", { maximumFractionDigits: digits }).format(v);
}
