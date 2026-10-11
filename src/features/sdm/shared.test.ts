import { describe, expect, it } from "vitest";
import { mondayOf, shiftWeek, weekLabel } from "./shared";

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
