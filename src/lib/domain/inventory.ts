// Inventaris. Cermin new_unit_cost(), opname_approve() dan shopping_list() di SQL.

export type CostMethod = "weighted_avg" | "last";

/** 4.1 Harga pokok baru saat stok masuk (4 desimal). Stok lama ≤ 0 → harga beli. */
export function newUnitCost(method: CostMethod, oldQty: number, oldCost: number, qty: number, cost: number): number {
  const v = method === "last" || oldQty <= 0 ? cost : (oldQty * oldCost + qty * cost) / (oldQty + qty);
  return Math.round(v * 10_000) / 10_000;
}

export type StockStatus = "reorder" | "low" | "ok";
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
