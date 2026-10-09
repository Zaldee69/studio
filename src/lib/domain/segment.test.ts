import { describe, expect, it } from "vitest";
import { cleanSegment, describeSegment } from "./segment";

describe("segmen campaign", () => {
  it("dibaca sebagai kalimat biasa", () => {
    expect(describeSegment({})).toBe("Semua pelanggan yang punya WhatsApp");
    expect(describeSegment({ inactive_weeks: 8, categories: ["massage", "nail"] }))
      .toBe("Pelanggan yang terakhir datang ≥ 8 minggu lalu dan pernah memakai Pijat atau Nail Art");
    expect(describeSegment({ min_visits: 5, min_spend: 1_000_000, online: false }))
      .toBe("Pelanggan yang sudah datang ≥ 5× dan total belanja ≥ Rp1.000.000 dan belum pernah booking online");
  });
  it("nilai kosong dibuang", () => {
    expect(cleanSegment({ inactive_weeks: undefined, categories: [], min_visits: 0, online: false })).toEqual({ online: false });
  });
});
