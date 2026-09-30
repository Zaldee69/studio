import type { CostMethod, StockStatus } from "@/lib/domain/inventory";

export type Kind = "consumable" | "retail";
export type StockRow = {
  item_id: string; name: string; kind: Kind; unit: string; reorder_at: number; unit_cost: number;
  supplier_id: string | null; active: boolean; qty: number; stock_value: number; status: StockStatus;
};
export type Supplier = { id: string; name: string; whatsapp: string | null; active: boolean };
export type InvSettings = { method: CostMethod; marginWarn: number; multiplier: number; shop: string; ratio: number; variancePct: number };

export const ADJUST_REASONS: [string, string][] = [
  ["rusak", "Rusak"], ["kedaluwarsa", "Kedaluwarsa"], ["tumpah", "Tumpah / tercecer"], ["keperluan_lain", "Keperluan lain"], ["koreksi", "Koreksi hitungan"],
];
export const MOVE_TYPE: Record<string, { label: string; bg: string; fg: string }> = {
  in: { label: "Masuk", bg: "#D9F2E1", fg: "#144D2A" },
  use: { label: "Pakai", bg: "#DCEBFF", fg: "#163D78" },
  sale: { label: "Jual", bg: "#EDE9FF", fg: "#3A2E8F" },
  opname: { label: "Opname", bg: "#FFF1C2", fg: "#5A4300" },
  adjust: { label: "Penyesuaian", bg: "#FFE2CC", fg: "#6B3000" },
};
export const SCOPE_LABEL: Record<string, string> = { consumable: "Bahan HPP", retail: "Barang ritel", all: "Semua" };
export const qtyFmt = (n: number) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(n);
