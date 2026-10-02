import { describe, expect, it } from "vitest";
import { attainment, marginPct, ownerPeriod } from "./owner";

describe("periode laporan owner", () => {
  const today = "2026-09-15";
  it("bulan selesai: vs bulan sebelumnya & bulan sama tahun lalu", () => {
    const p = ownerPeriod({ periode: "bulan", nilai: "2026-08" }, today);
    expect([p.from, p.to, p.label, p.partial]).toEqual(["2026-08-01", "2026-08-31", "Agustus 2026", false]);
    expect([p.previous.from, p.previous.to]).toEqual(["2026-07-01", "2026-07-31"]);
    expect([p.lastYear.from, p.lastYear.to, p.lastYear.label]).toEqual(["2025-08-01", "2025-08-31", "Agustus 2025"]);
  });
  it("Januari → pembanding Desember tahun sebelumnya", () => {
    const p = ownerPeriod({ periode: "bulan", nilai: "2026-01" }, today);
    expect([p.previous.from, p.previous.to]).toEqual(["2025-12-01", "2025-12-31"]);
  });
  it("bulan berjalan dipotong s.d. hari ini, pembanding sepanjang hari yang sama", () => {
    const p = ownerPeriod({}, today);
    expect([p.from, p.to, p.partial]).toEqual(["2026-09-01", "2026-09-15", true]);
    expect([p.previous.from, p.previous.to]).toEqual(["2026-08-01", "2026-08-15"]);
    expect([p.lastYear.from, p.lastYear.to]).toEqual(["2025-09-01", "2025-09-15"]);
    // 31 Mar berjalan → Feb dipotong di akhir Feb, bukan 3 Mar
    const m = ownerPeriod({ periode: "bulan", nilai: "2026-03" }, "2026-03-31");
    expect(m.previous.to).toBe("2026-02-28");
  });
  it("kuartal & tahun", () => {
    const q = ownerPeriod({ periode: "kuartal", nilai: "2026-Q1" }, today);
    expect([q.from, q.to, q.label, q.previous.from, q.previous.to, q.previous.label]).toEqual(["2026-01-01", "2026-03-31", "Kuartal I 2026", "2025-10-01", "2025-12-31", "Kuartal IV 2025"]);
    expect(q.lastYear.label).toBe("Kuartal I 2025");
    const y = ownerPeriod({ periode: "tahun", nilai: "2025" }, today);
    expect([y.from, y.to, y.previous.from, y.lastYear.from]).toEqual(["2025-01-01", "2025-12-31", "2024-01-01", "2024-01-01"]);
  });
  it("kustom: urutan dibalik aman; pembanding = panjang sama tepat sebelumnya; 29 Feb aman", () => {
    const k = ownerPeriod({ periode: "kustom", dari: "2026-09-10", sampai: "2026-09-01" }, today);
    expect([k.from, k.to, k.previous.from, k.previous.to]).toEqual(["2026-09-01", "2026-09-10", "2026-08-22", "2026-08-31"]);
    const leap = ownerPeriod({ periode: "kustom", dari: "2024-02-29", sampai: "2024-02-29" }, today);
    expect([leap.lastYear.from, leap.lastYear.to]).toEqual(["2023-02-28", "2023-02-28"]);
  });
  it("nilai tidak valid → bulan berjalan", () => {
    expect(ownerPeriod({ periode: "kuartal", nilai: "2026-Q7" }, today).kind).toBe("bulan");
  });
});

describe("capaian & margin", () => {
  it("target kosong → null; margin dari omzet bersih", () => {
    expect(attainment(90, 0)).toBeNull();
    expect(attainment(90, 120)).toBe(75);
    expect(marginPct(594_500, 59_450)).toBe(90);
    expect(marginPct(0, 0)).toBeNull();
  });
});
