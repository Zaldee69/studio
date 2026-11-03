import { describe, expect, it } from "vitest";
import { blastWarnings, cleanSegment, describeSegment } from "./segment";

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

describe("blastWarnings", () => {
  it("link tanpa ?src= dan kata waktu pada blast lebih dari sehari", () => {
    const msg = "Mulai hari ini, Senin 2 November, booking lewat dprasstudio.com/booking?.";
    expect(blastWarnings(msg, 216, 50)).toHaveLength(2);
    expect(blastWarnings(msg, 40, 50)).toHaveLength(1); // sehari selesai → hanya link
    expect(blastWarnings("Booking di dprasstudio.com/booking?src=wa ya Kak", 216, 50)).toEqual([]);
  });
});
