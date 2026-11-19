import { describe, expect, it } from "vitest";
import { rekap, statusOf, type KRow } from "./status";

const base = { tanggal: "2026-11-18", in_at: null, late_min: 0, libur: null, tutup: false };
describe("statusOf", () => {
  it("hadir / telat", () => {
    expect(statusOf({ ...base, in_at: "x" }, "2026-11-20")).toBe("hadir");
    expect(statusOf({ ...base, in_at: "x", late_min: 12 }, "2026-11-20")).toBe("telat");
  });
  it("bolos hanya untuk hari lampau tanpa libur/tutup", () => {
    expect(statusOf(base, "2026-11-20")).toBe("bolos");
    expect(statusOf({ ...base, libur: "libur" }, "2026-11-20")).toBe("libur");
    expect(statusOf({ ...base, libur: "izin" }, "2026-11-20")).toBe("izin");
    expect(statusOf({ ...base, tutup: true }, "2026-11-20")).toBe("tutup");
  });
  it("hari ini belum absen = belum, besok = nanti", () => {
    expect(statusOf({ ...base, tanggal: "2026-11-20" }, "2026-11-20")).toBe("belum");
    expect(statusOf({ ...base, tanggal: "2026-11-21" }, "2026-11-20")).toBe("nanti");
  });
  it("rekap menghitung hadir, telat, bolos, menit", () => {
    const r = (o: Partial<KRow>) => ({ ...base, profile_id: "a", nama: "A", kelompok: "kasir", out_at: null, auto_out: false, manual: false, note: "", ...o }) as KRow;
    expect(rekap([r({ in_at: "x" }), r({ in_at: "x", late_min: 20 }), r({})], "2026-11-20")).toEqual({ hadir: 2, telat: 1, bolos: 1, menitTelat: 20 });
  });
});
