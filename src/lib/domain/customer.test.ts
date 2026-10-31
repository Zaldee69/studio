import { describe, expect, it } from "vitest";
import { fillNama, followupLink, loyalty, customerCoverage } from "./customer";

describe("sapaan {nama}", () => {
  it("nama depan; 'Kak' bila nama belum diketahui; tidak menjadi 'Kak Kak'", () => {
    expect(fillNama("Halo Kak {nama}, apa kabar?", "Budi Santoso")).toBe("Halo Kak Budi, apa kabar?");
    expect(fillNama("Halo Kak {nama}, apa kabar?", "No Name")).toBe("Halo Kak, apa kabar?");
    expect(fillNama("Hai {nama}!", "No Name")).toBe("Hai Kak!");
    expect(followupLink("628123", "Halo Kak {nama}", "No Name")).toBe("https://wa.me/628123?text=Halo%20Kak");
  });
});

describe("penanda pelanggan di kasir", () => {
  const now = new Date("2026-11-02T03:00:00Z"), ago = (w: number) => new Date(now.getTime() - w * 7 * 86_400_000).toISOString();
  it("baru, jarang, langganan, biasa", () => {
    expect(loyalty(0, null, now)).toBe("baru");
    expect(loyalty(5, ago(9), now)).toBe("jarang");
    expect(loyalty(3, ago(4), now)).toBe("langganan");
    expect(loyalty(1, ago(2), now)).toBe("biasa");
    expect(loyalty(4, ago(7), now)).toBe("biasa");
  });
});

describe("cakupan data pelanggan (ambang 40%)", () => {
  it("di bawah 40% → belum cukup; tanpa transaksi → belum cukup", () => {
    expect(customerCoverage({ tx: 180, with_customer: 8 }).enough).toBe(false);
    expect(customerCoverage({ tx: 0, with_customer: 0 })).toEqual({ pct: null, enough: false });
    expect(customerCoverage(undefined).enough).toBe(false);
  });
  it("40% ke atas → cukup", () => {
    expect(customerCoverage({ tx: 10, with_customer: 4 })).toEqual({ pct: 40, enough: true });
  });
});
