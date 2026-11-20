import { describe, expect, it } from "vitest";
import { mondayOf, shiftWeek, weekLabel, kasbonDebt, restPay, NO_KASBON } from "./shared";

describe("minggu komisi (Senin–Minggu)", () => {
  it("Senin dari tanggal mana pun, lintas bulan & tahun", () => {
    expect(mondayOf("2026-10-04")).toBe("2026-09-28"); // Minggu → Senin sebelumnya
    expect(mondayOf("2026-09-28")).toBe("2026-09-28"); // Senin
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
    expect(shiftWeek("2026-09-28", 1)).toBe("2026-10-05");
    expect(shiftWeek("2026-09-28", -1)).toBe("2026-09-21");
  });
  it("label", () => {
    expect(weekLabel("2026-09-28")).toBe("28 Sep – 4 Okt 2026");
  });
});

import { catInfo } from "./shared";
describe("catInfo", () => {
  it("kategori layanan dikenal, selain itu (mis. kasir) tidak crash", () => {
    expect(catInfo("barbershop").label).toBe("Barbershop");
    expect(catInfo("kasir")).toEqual({ label: "Kasir", color: "#9AA3B0" });
    expect(catInfo("entah").color).toBe("#9AA3B0");
  });
});

describe("kasbon di gaji bulanan (Opsi A)", () => {
  it("sisa utang = expenses − terpotong, tak negatif", () => {
    expect(kasbonDebt({ ...NO_KASBON, expenses: 70000, cut: 50000 })).toBe(20000);
    expect(kasbonDebt({ ...NO_KASBON, expenses: 40000, cut: 40000 })).toBe(0);
    expect(kasbonDebt({ ...NO_KASBON, expenses: 0, cut: 10000 })).toBe(0);
  });
  it("non-bulanan (total_pay tanpa adjustment kasbon): kasbon mingguan dikurangkan sekali, rest tidak negatif akibat kasbon", () => {
    // gaji pokok 1jt, komisi 50rb dibayar mingguan 0 (kasbon 50rb terpotong); adj kasbon 70rb dikecualikan dari total_pay
    const k = { expenses: 70000, cut: 50000, adjKasbon: 70000, adjAll: -70000, cutMonth: 50000 };
    expect(restPay(1050000, 0, 0, k)).toBe(1000000);
  });
  it("pay_monthly / snapshot lama (total_pay memuat adjustment kasbon): tidak dikurangi dua kali", () => {
    const k = { expenses: 70000, cut: 0, adjKasbon: 70000, adjAll: -70000, cutMonth: 0 };
    expect(restPay(980000, -70000, 0, k)).toBe(980000);
    const old = { expenses: 70000, cut: 50000, adjKasbon: 70000, adjAll: -70000, cutMonth: 50000 };
    expect(restPay(980000, -70000, 0, old)).toBe(980000); // snapshot lama: adj kasbon & potongan mingguan saling menutup di rest
  });
  it("kasbon lama tanpa adjustment ikut dikurangkan; tanpa kasbon = rumus lama", () => {
    expect(restPay(1050000, 0, 0, { expenses: 100000, cut: 50000, adjKasbon: 0, adjAll: 0, cutMonth: 50000 })).toBe(1000000);
    expect(restPay(1050000, 0, 50000, NO_KASBON)).toBe(1000000);
  });
  it("bonus + kasbon non-bulanan: adjustments (bonus) != adjAll → kasbon mingguan dikurangkan", () => {
    const k = { expenses: 70000, cut: 50000, adjKasbon: 70000, adjAll: -45000, cutMonth: 50000 }; // bonus 25rb − kasbon 70rb
    expect(restPay(1075000, 25000, 0, k)).toBe(1025000);
  });
});
