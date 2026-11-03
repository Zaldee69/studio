import { describe, expect, it } from "vitest";
import {
  aov,   apptMinutes, bandStatus, BAND_LABEL, canRecord, canUndo, delta, deltaLabel,  
  funnel, heatmap, insights, maintenanceLabel, maintenanceState,  noShowRate, omzet, openMinutes, pct1, previousPeriod,
     splitByHour, utilization, type InsightInput, type Tx,
} from "./kpi";

// Data contoh tetap (spesifikasi bagian 4): satu hari, buka 09:00–21:00.
const TX: Tx[] = [
  { items: [{ category: "barbershop", netAmount: 75000 }] },                                              // T1
  { items: [{ category: "nail", netAmount: 180000 }] },                                                   // T2
  { items: [{ category: "barbershop", netAmount: 67500 }, { category: "nail", netAmount: 162000 }], bundle: true }, // T3
  { items: [{ category: "retail", netAmount: 110000 }] },                                                 // T4
  { items: [{ category: "barbershop", netAmount: 75000 }], voided: true },                                // T5
];

describe("U1–U2 AOV & omzet", () => {
  it("AOV Barbershop 71.250, Nail 171.000; void diabaikan", () => {
    expect(aov(TX, "barbershop")).toBe(71250);
    expect(aov(TX, "nail")).toBe(171000);
    expect(aov([], "nail")).toBeNull();
  });
  it("omzet 594.500", () => {
    expect(omzet(TX)).toBe(594500);
  });
});

describe("U5 utilisasi", () => {
  const appts = [
    { status: "completed", durationMin: 45, startedAt: "2026-03-10T03:00:00Z", endedAt: "2026-03-10T03:47:00Z" }, // nyata 47
    { status: "completed", durationMin: 60 },                                                                   // rencana 60
    { status: "booked", durationMin: 30 },                                                                      // tidak dihitung
  ];
  it("107 ÷ 720 = 14,9%; mode rencana 105 ÷ 720", () => {
    expect(pct1(utilization(appts, 720))).toBe("14,9");
    expect(pct1(utilization(appts, 720, { mode: "planned" }))).toBe("14,6");
  });
  it("hari libur tidak dihitung tersedia: 7 hari, 1 libur → 4.320 menit", () => {
    const days = Array.from({ length: 7 }, (_, i) => ({ closed: i === 3, openMin: 540, closeMin: 1260 }));
    expect(openMinutes(days)).toBe(4320);
  });
  it("in_service berjalan dibatasi jam tutup", () => {
    const a = { status: "in_service", durationMin: 60, startedAt: "2026-03-10T13:30:00Z" };               // mulai 20:30 WIB
    expect(apptMinutes(a, new Date("2026-03-10T13:50:00Z"))).toBe(20);
    expect(apptMinutes(a, new Date("2026-03-10T15:00:00Z"), new Date("2026-03-10T14:00:00Z"))).toBe(30); // tutup 21:00
  });
});

describe("U6 peta panas", () => {
  it("14:30–15:30 WIB terbagi 30 menit di jam 14 & 15", () => {
    expect(splitByHour("2026-03-10T07:30:00Z", "2026-03-10T08:30:00Z")).toEqual([
      { weekday: 2, hour: 14, minutes: 30 }, { weekday: 2, hour: 15, minutes: 30 }]);
  });
  it("pembagi = jumlah tanggal hari-minggu itu dalam periode", () => {
    // 3–16 Mar 2026: dua hari Selasa (3 & 10); satu layanan 60 menit Selasa 10 Mar jam 14 → rata-rata 30.
    const cell = heatmap([{ start: "2026-03-10T07:00:00Z", end: "2026-03-10T08:00:00Z" }], "2026-03-03", "2026-03-16");
    expect(cell(2, 14)).toBe(30);
    expect(cell(3, 14)).toBe(0);
  });
});

describe("U10 funnel & no-show", () => {
  it("konversi antar langkah & no-show", () => {
    expect(funnel([10, 5, 2]).map((s) => s.pct)).toEqual([null, 50, 40]);
    expect(pct1(noShowRate(1, 2)!)).toBe("33,3");
    expect(noShowRate(0, 0)).toBeNull();
  });
});

describe("U11 perbandingan periode", () => {
  it("7,2 jt vs 6,4 jt → ▲ 12,5%; lalu 0 → baru", () => {
    expect(deltaLabel(delta(7_200_000, 6_400_000))).toBe("▲ 12,5%");
    expect(deltaLabel(delta(5, 0))).toBe("baru");
    expect(deltaLabel(5, "poin")).toBe("▲ 5,0 poin"); // metrik persen: 10% → 15%
    expect(deltaLabel(delta(90, 100))).toBe("▼ 10,0%");
  });
  it("periode sebelumnya: panjang sama, tepat sebelum from", () => {
    expect(previousPeriod("2026-09-22", "2026-09-28")).toEqual({ from: "2026-09-15", to: "2026-09-21" });
  });
});

describe("U12 insight berbasis aturan", () => {
  const base: InsightInput = {
    aov: { barbershop: 71250, nail: 171000 }, targets: { barbershop: 120000, nail: 200000 }, aovGapPct: 10,
    upsellRate: { barbershop: 0, nail: 0 }, upsellName: { barbershop: "Hair Spa", nail: "Callus Treatment" },
    utilization: [{ name: "Kursi Barber 1", pct: 14.86 }, { name: "Kursi Barber 2", pct: 0 }], lowUtilPct: 10,
    busiest: { weekday: 6, hour: 15 }, retailRatio: 22.7, retailMin: 15, retailMax: 20, noShowRate: 33.3,
    overruns: [{ name: "Hair Spa", diffAvg: 12 }],
  };
  it("maks 3, urut prioritas", () => {
    expect(insights(base).map((i) => i.code)).toEqual(["aov_barbershop", "aov_nail", "low_util"]);
    expect(insights(base)[0].message).toBe("AOV Barbershop 40,6% di bawah target. Tingkat upsell Barbershop 0,0% — tawarkan Hair Spa.");
    expect(insights(base)[2].message).toBe("Kursi Barber 2 terpakai 0,0% — jam paling ramai: Sabtu 15:00. Pertimbangkan jadwal staf / promo jam sepi.");
  });
  it("tepat di ambang tidak terpicu", () => {
    const i = { ...base, targets: { barbershop: 70000, nail: 190000 } };                    // nail tepat 10% di bawah
    expect(insights(i).map((x) => x.code)).toEqual(["low_util", "retail_ratio", "no_show"]);
    const quiet = { ...i, utilization: [{ name: "Kursi Barber 2", pct: 10 }], retailRatio: 20, noShowRate: 10 };
    expect(insights(quiet).map((x) => x.code)).toEqual(["overrun"]);
    expect(insights({ ...quiet, overruns: [{ name: "Hair Spa", diffAvg: 10 }] })).toEqual([]);
  });
  it("teks rasio ritel & no-show", () => {
    const i = insights({ ...base, aov: {}, utilization: [] });
    expect(i.map((x) => x.message)).toEqual(["Rasio ritel 22,7%, di atas target 15–20%.", "No-show 33,3% — aktifkan pengingat H-1.",
      "Hair Spa rata-rata molor 12 menit — perbarui durasi di Pengaturan."]);
  });
});

describe("U13 SOP", () => {
  it("urutan tahap & pembatalan", () => {
    expect(canRecord({}, "wash")).toBe(true);
    expect(canRecord({}, "soak")).toBe(false);
    expect(canRecord({ wash: 1 }, "soak")).toBe(true);
    expect(canUndo({ wash: 1, soak: 1 }, "wash")).toBe(false); // Rendam masih aktif
    expect(canUndo({ wash: 1, soak: 1 }, "soak")).toBe(true);
  });
});

describe("U14 status perawatan", () => {
  it("terlambat, jatuh tempo, kuning, hijau", () => {
    expect(maintenanceState(-2)).toBe("overdue");
    expect(maintenanceLabel(-2)).toBe("Terlambat 2 hari");
    expect(maintenanceLabel(0)).toBe("Jatuh tempo hari ini");
    expect(maintenanceState(3)).toBe("soon");
    expect(maintenanceState(4)).toBe("ok");
  });
});
