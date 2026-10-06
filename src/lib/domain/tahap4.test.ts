import { describe, expect, it } from "vitest";
import { allocateDiscount, bundleDiscount, type CartLine } from "./cart";
import { itemCommission, monthlyPay, rankStaff, retailCommission, returnRate, serviceHpp, serviceMargin, upsellRate } from "./commission";
import { crossesReorder, newUnitCost, opnameMoves, stockStatus, suggestOrder, supplierMessage, usageVariance } from "./inventory";

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

describe("U5 jaring pengaman", () => {
  const pay = (commission: number, adjustments = 0) => monthlyPay([{ netAmount: commission, hpp: 0 }], 100, 1_200_000, { adjustments });
  it("komisi 1.199.999 → subsidi 1", () => expect(pay(1_199_999).subsidy).toBe(1));
  it("komisi = ambang → 0; di atas ambang → 0", () => {
    expect(pay(1_200_000).subsidy).toBe(0);
    expect(pay(1_500_000).subsidy).toBe(0);
  });
  it("Dimas 886.440 → subsidi 313.560; bonus +100.000 → total 1.300.000", () => {
    const p = pay(886_440, 100_000);
    expect(p.subsidy).toBe(313_560);
    expect(p.totalPay).toBe(1_300_000);
  });
  it("bonus tidak mengurangi subsidi, potongan tidak menambah subsidi", () => {
    expect(pay(886_440, 100_000).subsidy).toBe(pay(886_440).subsidy);
    const cut = pay(886_440, -50_000);
    expect(cut.subsidy).toBe(313_560);
    expect(cut.totalPay).toBe(1_150_000);
  });
});

describe("U6 komisi ritel", () => {
  it("Pomade 110.000 dijual Maya, 5% = 5.500", () => expect(retailCommission(110000, 5, "maya")).toBe(5500));
  it("tanpa penjual → 0", () => expect(retailCommission(110000, 5, null)).toBe(0));
  it("masuk ke total bulanan", () => {
    const p = monthlyPay([{ netAmount: 67500, hpp: 1200 }, { netAmount: 110000, hpp: 60000, retail: true, sellerId: "maya" }], 40, 0, { retailPct: 5 });
    expect(p).toMatchObject({ commissionService: 26520, commissionRetail: 5500, commission: 32020 });
  });
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
  it("status stok & melewati ambang", () => {
    expect(stockStatus(35, 100)).toBe("reorder");
    expect(stockStatus(150, 100)).toBe("low");
    expect(stockStatus(151, 100)).toBe("ok");
    expect(crossesReorder(101, 100, 100)).toBe(true);
    expect(crossesReorder(100, 99, 100)).toBe(false); // sudah di bawah → tidak dobel
  });
});

describe("U8 pemakaian teoretis vs aktual", () => {
  it("shampoo: teoretis 3.250, aktual 3.500 → +250 ml (+7,7%) tidak ditandai", () => {
    const theoretical = 120 * 15 + 40 * 25 + 30 * 15;
    expect(theoretical).toBe(3250);
    expect(usageVariance({ theoretical, start: 2200, incoming: 2000, adjust: 0, end: 700, sold: 0 }, 10))
      .toEqual({ actual: 3500, variance: 250, pct: 7.7, flagged: false });
  });
  it("di atas ambang → ditandai; teoretis 0 tapi terpakai → ditandai", () => {
    expect(usageVariance({ theoretical: 30, start: 1000, incoming: 500, adjust: -10, end: 1440, sold: 0 }, 10).flagged).toBe(true);
    expect(usageVariance({ theoretical: 0, start: 10, incoming: 0, adjust: 0, end: 8, sold: 0 }, 10).flagged).toBe(true);
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

describe("U11 peringkat & evaluasi", () => {
  it("seri → jumlah layanan, lalu nama", () => {
    const r = rankStaff([
      { name: "Rizky", revenue: 500000, count: 5 }, { name: "Andi", revenue: 500000, count: 5 },
      { name: "Dimas", revenue: 500000, count: 6 }, { name: "Sari", revenue: 900000, count: 3 },
    ]);
    expect(r.map((x) => `${x.rank}${x.name}`)).toEqual(["1Sari", "2Dimas", "3Andi", "4Rizky"]);
  });
  it("tingkat upsell per transaksi", () => {
    expect(upsellRate([{ tx: "1", fromUpsell: false }, { tx: "1", fromUpsell: true }, { tx: "2", fromUpsell: false },
      { tx: "3", fromUpsell: false }, { tx: "4", fromUpsell: false }])).toBe(25);
  });
  it("pelanggan kembali: tepat 60 hari ya, 61 hari tidak, walk-in diabaikan", () => {
    expect(returnRate([
      { customerId: "a", date: "2025-03-01" }, { customerId: "a", date: "2025-04-30" },
      { customerId: "b", date: "2025-03-01" }, { customerId: "b", date: "2025-05-01" },
      { customerId: null, date: "2025-03-01" }, { customerId: null, date: "2025-03-02" },
    ], 2025)).toBe(50);
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
