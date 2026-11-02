import { describe, expect, it } from "vitest";
import { allocateDiscount, bundleDiscount, type CartLine } from "./cart";
import { itemCommission, serviceHpp, serviceMargin, upsellRate } from "./commission";
import { crossesReorder, newUnitCost, opnameMoves, suggestOrder, supplierMessage } from "./inventory";

describe("U1 harga pokok saat stok masuk", () => {
  it("rata-rata tertimbang: 450 ml @120 + 1.000 ml @135 = Rp130,3448", () => {
    expect(newUnitCost("weighted_avg", 450, 120, 1000, 135)).toBe(130.3448);
  });
  it("stok lama 0 (atau minus) → harga beli", () => {
    expect(newUnitCost("weighted_avg", 0, 120, 10, 135)).toBe(135);
    expect(newUnitCost("weighted_avg", -5, 120, 10, 135)).toBe(135);
  });
  it("metode harga terakhir", () => expect(newUnitCost("last", 450, 120, 1000, 135)).toBe(135));
});

describe("U2 HPP & margin Gel Polish Tangan", () => {
  const hpp = serviceHpp([{ qty: 3, unitCost: 1200 }, { qty: 4, unitCost: 1800 }, { qty: 15, unitCost: 40 }, { qty: 4, unitCost: 150 }]);
  it("HPP = 12.000", () => expect(hpp).toBe(12000));
  it("margin 168.000 (93,3%), komisi 67.200, laba kontribusi 100.800", () => {
    expect(serviceMargin(180000, hpp, 40)).toEqual({ margin: 168000, marginPct: 93.3, commission: 67200, contribution: 100800 });
  });
  it("HPP dibulatkan setengah ke atas", () => expect(serviceHpp([{ qty: 3, unitCost: 130.3448 }])).toBe(391));
});

describe("U3 alokasi diskon bundle (aturan yang berjalan: floor, sisa ke item layanan terakhir)", () => {
  const L = (name: string, category: CartLine["category"], price: number): CartLine => ({ serviceId: name, name, category, price });
  it("Potong 75.000 + Gel 180.000, diskon 10% = 25.500 → 7.500 / 18.000", () => {
    const lines = [L("potong", "barbershop", 75000), L("gel", "nail", 180000)];
    const d = bundleDiscount(lines, 10);
    expect(d).toBe(25500);
    expect(allocateDiscount(lines, d)).toEqual([7500, 18000]);
  });
  it("tiga item harga ganjil: Σ porsi = diskon tepat; ritel tidak kebagian", () => {
    const lines = [L("a", "barbershop", 33333), L("r", "retail", 110000), L("b", "nail", 66667), L("c", "nail", 45555)];
    const d = bundleDiscount(lines, 10);
    const s = allocateDiscount(lines, d);
    expect(s[1]).toBe(0);
    expect(s.reduce((a, x) => a + x, 0)).toBe(d);
  });
});

describe("U4 komisi hibrida", () => {
  it("Andi (67.500 − 1.200) × 40% = 26.520; Sari (162.000 − 12.000) × 40% = 60.000", () => {
    expect(itemCommission(67500, 1200, 40)).toBe(26520);
    expect(itemCommission(162000, 12000, 40)).toBe(60000);
  });
  it("override staf 45%", () => expect(itemCommission(162000, 12000, 45)).toBe(67500));
  it("net < HPP → 0", () => expect(itemCommission(1000, 5000, 40)).toBe(0));
  it("pembulatan per item, setengah ke atas", () => expect(itemCommission(1001, 0, 50)).toBe(501));
});

describe("U7 stok opname", () => {
  it("neck strip sistem 35, fisik 32 → mutasi −3, nilai −900; hitungan kosong tanpa mutasi", () => {
    const r = opnameMoves([
      { itemId: "neck", system: 35, counted: 32, unitCost: 300 },
      { itemId: "krim", system: 450, counted: null, unitCost: 120 },
      { itemId: "tisu", system: 100, counted: 100, unitCost: 150 },
    ]);
    expect(r.moves).toEqual([{ itemId: "neck", qty: -3, value: -900 }]);
    expect(r.value).toBe(-900);
  });
  it("melewati ambang", () => {
    expect(crossesReorder(101, 100, 100)).toBe(true);
    expect(crossesReorder(100, 99, 100)).toBe(false); // sudah di bawah → tidak dobel
  });
});

describe("daftar belanja", () => {
  it("saran beli sampai 2× ambang, kelipatan min order", () => {
    expect(suggestOrder(35, 100, 2)).toBe(165);
    expect(suggestOrder(35, 100, 2, 50)).toBe(200);
    expect(suggestOrder(250, 100, 2)).toBe(0);
  });
  it("pesan WhatsApp pemasok", () => {
    expect(supplierMessage("Pak Budi", "D'Pras Barbershop", [{ name: "Neck strip", qty: 200, unit: "pcs" }, { name: "Krim hair spa", qty: 1000, unit: "ml" }]))
      .toBe("Halo Pak Budi, kami dari D'Pras Barbershop mau pesan:\n- Neck strip 200 pcs\n- Krim hair spa 1.000 ml\n\nTerima kasih.");
  });
});

describe("U11 evaluasi", () => {
  it("tingkat upsell per transaksi", () => {
    expect(upsellRate([{ tx: "1", fromUpsell: false }, { tx: "1", fromUpsell: true }, { tx: "2", fromUpsell: false },
      { tx: "3", fromUpsell: false }, { tx: "4", fromUpsell: false }])).toBe(25);
  });
});

describe("ekspor CSV", () => {
  it("BOM, pemisah ;, kutip — bisa dibaca ulang", async () => {
    const { toCsv, parseCsv } = await import("./csv");
    const csv = toCsv([["Nama", "Catatan"], ["Andi", 'kata "bagus"; rapi'], ["Sari", 1300000]]);
    expect(csv.startsWith("﻿Nama;Catatan\r\n")).toBe(true);
    expect(parseCsv(csv)).toEqual([["Nama", "Catatan"], ["Andi", 'kata "bagus"; rapi'], ["Sari", "1300000"]]);
  });
});
