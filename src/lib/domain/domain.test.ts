import { describe, expect, it } from "vitest";
import { calcCart, promoEligible, upsellSuggestions, type CartLine } from "./cart";
import { monthlyPay, serviceHpp } from "./commission";
import { followupLink, isChurn } from "./customer";
import { formatRupiah, formatTanggal, normalizeWhatsApp } from "./format";
import { aov, retailRatio, utilization } from "./kpi";
import { availableSlots, minToHHMM, planBooking } from "./slots";
import { nextStatus } from "./status";

const potong: CartLine = { serviceId: "potong", name: "Potong Rambut", category: "barbershop", price: 75000 };
const mani: CartLine = { serviceId: "mani", name: "Manicure Basic", category: "nail", price: 90000 };
const pomade: CartLine = { serviceId: "pomade", name: "Pomade Matte", category: "retail", price: 110000 };

describe("format", () => {
  it("rupiah, tanggal, WA", () => {
    expect(formatRupiah(1500000)).toBe("Rp1.500.000");
    expect(formatRupiah(-500)).toBe("-Rp500");
    expect(formatTanggal("2026-09-28T03:00:00Z")).toBe("Senin, 28 Sep 2026");
    expect(normalizeWhatsApp("0812-3456-7890")).toBe("6281234567890");
    expect(normalizeWhatsApp("+62 812 3456 7890")).toBe("6281234567890");
    expect(normalizeWhatsApp("81234567890")).toBe("6281234567890");
    expect(normalizeWhatsApp("123")).toBeNull();
  });
});

describe("keranjang (cermin checkout SQL)", () => {
  it("diskon bundle hanya jika barbershop + nail; ritel tidak didiskon", () => {
    expect(calcCart([potong, pomade], { bundlePct: 10, method: "cash" }).discount).toBe(0);
    const r = calcCart([potong, mani, pomade], { bundlePct: 10, method: "cash" });
    expect(r).toMatchObject({ subtotal: 275000, discount: 16500, total: 258500, paid: 258500, paymentMethod: "cash" });
    expect(r.shares).toEqual([7500, 9000, 0]);
    expect(r.discountLabel).toBe("Diskon paket 10%");
  });
  it("promo booking online: hanya layanan dari booking online, tidak ditumpuk dengan paket (pakai yang lebih besar)", () => {
    const r = calcCart([{ ...potong, promo: true }, pomade], { bundlePct: 10, promoPct: 10, method: "cash" });
    expect(r).toMatchObject({ discount: 7500, discountLabel: "Promo booking online 10%" });
    expect(r.shares).toEqual([7500, 0]);
    const both = calcCart([{ ...potong, promo: true }, mani], { bundlePct: 10, promoPct: 10, method: "cash" });
    expect(both).toMatchObject({ discount: 16500, discountLabel: "Diskon paket 10%" }); // paket 16.500 > promo 7.500
    const promo = { pct: 10, start: "2026-10-10", end: "2026-10-31" };
    expect(promoEligible({ source: "online", created_at: "2026-10-09T17:30:00Z" }, promo)).toBe(true);  // 10 Okt 00.30 WIB
    expect(promoEligible({ source: "online", created_at: "2026-10-09T16:30:00Z" }, promo)).toBe(false); // 9 Okt 23.30 WIB
    expect(promoEligible({ source: "walk_in", created_at: "2026-10-15T03:00:00Z" }, promo)).toBe(false);
    expect(promoEligible({ source: "online", created_at: "2026-10-15T03:00:00Z" }, { ...promo, pct: 0 })).toBe(false);
  });
  it("pembulatan ke Rp100 dan porsi selalu berjumlah = diskon", () => {
    const a = { ...potong, price: 33333 }, b = { ...mani, price: 44444 };
    const r = calcCart([a, b], { bundlePct: 15, method: "cash" });
    expect(r.discount % 100).toBe(0);
    expect(r.discount).toBe(11700); // 77777 × 15% = 11666,55 → 11700
    expect(r.shares.reduce((x, y) => x + y, 0)).toBe(r.discount);
  });
  it("deposit: min(saldo, total) + metode kombinasi", () => {
    expect(calcCart([potong], { bundlePct: 10, method: "qris", useDeposit: true, depositBalance: 50000 }))
      .toMatchObject({ depositUsed: 50000, paid: 25000, paymentMethod: "deposit_qris" });
    expect(calcCart([potong], { bundlePct: 10, method: "cash", useDeposit: true, depositBalance: 900000 }))
      .toMatchObject({ depositUsed: 75000, paid: 0, paymentMethod: "deposit" });
    expect(calcCart([potong], { bundlePct: 10, method: "cash", useDeposit: true, depositBalance: -5 }).depositUsed).toBe(0);
  });
  it("upsell kontekstual", () => {
    const svcs = [{ id: "potong", upsell_service_id: "spa" }, { id: "mani", upsell_service_id: "callus" }, { id: "spa", upsell_service_id: null }];
    expect(upsellSuggestions(["potong", "mani"], svcs)).toEqual(["spa", "callus"]);
    expect(upsellSuggestions(["potong", "spa"], svcs)).toEqual([]);
    expect(upsellSuggestions(["potong", "mani"], svcs, ["spa"])).toEqual(["callus"]);
  });
});

describe("HPP & komisi", () => {
  it("HPP resep dan jaring pengaman", () => {
    expect(serviceHpp([{ qty: 20, unitCost: 50 }, { qty: 1, unitCost: 300 }])).toBe(1300);
    expect(monthlyPay([{ netAmount: 81000, hpp: 2000 }], 40, 1200000)).toMatchObject(
      { commission: 31600, subsidy: 1168400, totalPay: 1200000 });
    expect(monthlyPay([{ netAmount: 5_000_000, hpp: 0 }], 40, 1200000))
      .toMatchObject({ commission: 2000000, subsidy: 0, totalPay: 2000000 });
    expect(monthlyPay([{ netAmount: 1000, hpp: 5000 }], 40, 0).commission).toBe(0); // rugi tidak negatif
  });
});

describe("pelanggan & status", () => {
  it("churn & follow-up", () => {
    const now = new Date("2026-09-29T00:00:00Z");
    expect(isChurn("2026-08-01T00:00:00Z", 4, now)).toBe(true);
    expect(isChurn("2026-09-20T00:00:00Z", 4, now)).toBe(false);
    expect(isChurn(null, 4, now)).toBe(false);
    expect(followupLink("6281", "Halo {nama}!", "Rina Wati")).toBe("https://wa.me/6281?text=Halo%20Rina!");
  });
  it("alur status", () => {
    expect(nextStatus("booked")).toBe("arrived");
    expect(nextStatus("in_service")).toBe("completed");
    expect(nextStatus("completed")).toBeNull(); // paid hanya lewat checkout
    expect(nextStatus("cancelled")).toBeNull();
  });
});

describe("KPI", () => {
  it("AOV, utilisasi, rasio ritel", () => {
    const txs = [
      { items: [{ category: "barbershop" as const, netAmount: 100000 }, { category: "retail" as const, netAmount: 20000 }] },
      { items: [{ category: "barbershop" as const, netAmount: 140000 }, { category: "nail" as const, netAmount: 200000 }] },
      { items: [{ category: "nail" as const, netAmount: 999999 }], voided: true },
    ];
    expect(aov(txs, "barbershop")).toBe(120000);
    expect(aov(txs, "nail")).toBe(200000);
    expect(retailRatio(txs)).toBeCloseTo((20000 / 440000) * 100);
    expect(utilization([{ status: "paid", durationMin: 360 }, { status: "booked", durationMin: 60 }], 720)).toBe(50);
  });
});

describe("slot booking (cermin plan_booking SQL)", () => {
  const resources = [
    { id: "b1", type: "barbershop" as const, isPedicure: false },
    { id: "m1", type: "nail" as const, isPedicure: false },
    { id: "p1", type: "nail" as const, isPedicure: true },
  ];
  const staff = [{ id: "andi", category: "barbershop" as const }, { id: "sari", category: "nail" as const }];
  const cut = { id: "cut", category: "barbershop" as const, durationMin: 45, needsPedicure: false };
  const pedi = { id: "pedi", category: "nail" as const, durationMin: 60, needsPedicure: true };
  const mani = { id: "mani", category: "nail" as const, durationMin: 45, needsPedicure: false };

  it("berdua bersamaan: mulai sama; pedicure dapat kursi pedicure", () => {
    const plan = planBooking({ services: [cut, pedi], resources, staff, busy: [], together: true }, 600);
    expect(plan?.map((g) => [g.resourceId, g.startMin])).toEqual([["b1", 600], ["p1", 600]]);
  });
  it("manicure tidak memakai kursi pedicure bila meja kosong", () => {
    expect(planBooking({ services: [mani], resources, staff, busy: [], together: true }, 600)?.[0].resourceId).toBe("m1");
  });
  it("sendiri berurutan: nail setelah barber", () => {
    const plan = planBooking({ services: [cut, mani], resources, staff, busy: [], together: false }, 600);
    expect(plan?.map((g) => g.startMin)).toEqual([600, 645]);
  });
  it("bentrok staf / resource menutup slot; jam tutup & minimal mulai dihormati", () => {
    const busy = [{ resourceId: "b1", staffId: "andi", startMin: 600, endMin: 645 }];
    const ctx = { services: [cut], resources, staff, busy, together: true };
    const slots = availableSlots(ctx, 540, 750, 570).map(minToHHMM);
    expect(slots).toEqual(["11:00", "11:30"]); // 09:00 < minimal; 09:30–10:30 bentrok; 12:00+45 > tutup 12:30
  });
});
