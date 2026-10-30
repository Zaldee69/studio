import { describe, expect, it } from "vitest";
import { calcCart, type CartLine, type Voucher } from "./cart";

// Cermin checkout(): voucher dibanding diskon paket/promo, pakai yang terbesar; hanya baris berkategori cocok.
const v = (o: Partial<Voucher> = {}): Voucher => ({ id: "v1", code: "HEMAT20", kind: "pct", value: 20, category: "barbershop", min_spend: 0, active: true, ...o });
const line = (category: CartLine["category"], price: number, voucher: Voucher | null = null): CartLine =>
  ({ serviceId: `${category}-${price}`, name: category, category, price, voucher });
const calc = (lines: CartLine[]) => calcCart(lines, { bundlePct: 10, method: "cash" });

describe("voucher di keranjang kasir", () => {
  it("persen: 20% dari 50.000 → 10.000, label voucher", () => {
    const r = calc([line("barbershop", 50000, v())]);
    expect([r.discount, r.discountLabel]).toEqual([10000, "Voucher HEMAT20"]);
  });
  it("kategori lain & ritel tidak ikut; potongan hanya di baris voucher", () => {
    const r = calc([line("barbershop", 50000, v()), line("retail", 90000, v())]);
    expect(r.discount).toBe(10000);
    expect(r.shares).toEqual([10000, 0]);
  });
  it("minimal belanja tidak tercapai → tanpa potongan", () => {
    expect(calc([line("barbershop", 50000, v({ min_spend: 100000 }))]).discount).toBe(0);
  });
  it("nominal tidak melebihi harga layanan", () => {
    expect(calc([line("barbershop", 20000, v({ kind: "amount", value: 50000 }))]).discount).toBe(20000);
  });
  it("maks. potongan membatasi persen; kosong = tanpa batas", () => {
    expect(calc([line("barbershop", 300000, v({ value: 10, max_discount: 10000 }))]).discount).toBe(10000);
    expect(calc([line("barbershop", 300000, v({ value: 10, max_discount: null }))]).discount).toBe(30000);
  });
  it("tidak ditumpuk: diskon paket lebih besar dipakai", () => {
    const r = calc([line("barbershop", 50000, v({ kind: "amount", value: 1000, category: null })), line("nail", 150000)]);
    expect(r.discountLabel).toBe("Diskon paket 10%");
  });
  it("voucher nonaktif diabaikan", () => {
    expect(calc([line("barbershop", 50000, v({ active: false }))]).discount).toBe(0);
  });
});
