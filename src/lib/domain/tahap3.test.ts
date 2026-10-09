import { afterEach, describe, expect, it, vi } from "vitest";
import { canCancel, dayWindow, openStatus, type DayHours } from "./hours";
import { buildIcs } from "./ics";
import { minToHHMM as minToTime, planBooking, slotsForDay } from "./slots";
import { verifyTurnstile } from "../turnstile";

const week: DayHours[] = Array.from({ length: 7 }, (_, d) => ({ weekday: d, open_time: "09:00", close_time: "21:00", closed: false }));
week[0] = { ...week[0], open_time: "10:00", close_time: "18:00" };   // Minggu pendek
week[1] = { ...week[1], closed: true };                               // Senin libur

describe("jam buka & Buka/Tutup (Asia/Jakarta)", () => {
  it("jam per hari, libur mingguan, libur khusus", () => {
    expect(dayWindow("2026-10-04", week, [])).toEqual({ open: 600, close: 1080 }); // Minggu
    expect(dayWindow("2026-10-05", week, [])).toBeNull();                          // Senin
    expect(dayWindow("2026-10-06", week, ["2026-10-06"])).toBeNull();              // libur khusus
  });
  it("penanda Buka/Tutup", () => {
    expect(openStatus(new Date("2026-10-03T05:00:00Z"), week, [])).toEqual({ open: true, label: "Sedang buka · sampai pukul 21.00" });  // Sabtu 12.00
    expect(openStatus(new Date("2026-10-03T01:00:00Z"), week, []).label).toBe("Sedang tutup · buka hari ini pukul 09.00");              // Sabtu 08.00
    expect(openStatus(new Date("2026-10-04T12:00:00Z"), week, []).label).toBe("Sedang tutup · buka Selasa pukul 09.00");                // Minggu 19.00 → Senin libur
    expect(openStatus(new Date("2026-10-03T15:00:00Z"), week, []).label).toBe("Sedang tutup · buka besok pukul 10.00");                 // Sabtu 22.00
  });
  it("batas pembatalan", () => {
    const now = Date.parse("2026-10-03T10:00:00+07:00");
    expect(canCancel("2026-10-03T12:00:00+07:00", 2, now)).toBe(true);
    expect(canCancel("2026-10-03T11:59:00+07:00", 2, now)).toBe(false);
  });
});

describe("pembentukan slot (cermin get_available_slots)", () => {
  const res = [{ id: "b1", type: "barbershop" as const, isPedicure: false }, { id: "p1", type: "nail" as const, isPedicure: true }, { id: "m1", type: "nail" as const, isPedicure: false }];
  const staff = [{ id: "andi", category: "barbershop" as const }, { id: "sari", category: "nail" as const }];
  const cut = { id: "cut", category: "barbershop" as const, durationMin: 45, needsPedicure: false };
  const base = { services: [cut], resources: res, staff, busy: [], together: true };
  it("hari libur → kosong; lead time hanya untuk hari ini", () => {
    expect(slotsForDay(base, null, { isToday: false, nowMin: 0, leadMin: 60 })).toEqual([]);
    const win = { open: 540, close: 720 };
    expect(slotsForDay(base, win, { isToday: true, nowMin: 600, leadMin: 60 }).map(minToTime)).toEqual(["11:00"]); // 11:30+45 > tutup 12:00
    expect(slotsForDay(base, win, { isToday: false, nowMin: 600, leadMin: 60 })[0]).toBe(540);
  });
  it("buffer antar booking", () => {
    const busy = [{ resourceId: "b1", staffId: "andi", startMin: 600, endMin: 645 }];
    const win = { open: 540, close: 780 };
    const noBuf = slotsForDay({ ...base, busy }, win, { isToday: false, nowMin: 0, leadMin: 0 }).map(minToTime);
    const buf = slotsForDay({ ...base, busy, buffer: 30 }, win, { isToday: false, nowMin: 0, leadMin: 0 }).map(minToTime);
    expect(noBuf).toContain("11:00");
    expect(buf).not.toContain("11:00");
    expect(buf).not.toContain("09:30"); // 09:30–10:15 + 30 menit menabrak 10:00
    expect(buf).toContain("11:30");
  });
  it("kursi utama diutamakan bila kosong, pindah bila terpakai; pedicure tetap nomor satu", () => {
    const chairs = [{ id: "b1", type: "barbershop" as const, isPedicure: false }, { id: "b2", type: "barbershop" as const, isPedicure: false }];
    const rizky = [{ id: "rizky", category: "barbershop" as const, homeResourceId: "b2" }];
    const ctx = { ...base, resources: chairs, staff: rizky };
    expect(planBooking(ctx, 600)![0]).toMatchObject({ staffId: "rizky", resourceId: "b2" });
    const busy = [{ resourceId: "b2", staffId: null, startMin: 600, endMin: 660 }];
    expect(planBooking({ ...ctx, busy }, 600)![0].resourceId).toBe("b1"); // lunak: tidak mengurangi slot
    const pedi = { id: "pedi", category: "nail" as const, durationMin: 60, needsPedicure: true };
    const sari = [{ id: "sari", category: "nail" as const, homeResourceId: "m1" }];
    expect(planBooking({ ...base, services: [pedi], staff: sari }, 600)![0].resourceId).toBe("p1");
  });
  it("izin staf menutup slot di rentang itu", () => {
    const offs = [{ staffId: "andi", startMin: 540, endMin: 720 }];
    const s = slotsForDay({ ...base, offs }, { open: 540, close: 840 }, { isToday: false, nowMin: 0, leadMin: 0 }).map(minToTime);
    expect(s[0]).toBe("12:00");
  });
});

describe(".ics", () => {
  it("zona Asia/Jakarta, escape, CRLF", () => {
    const ics = buildIcs({ uid: "GB-7K3Q@dpras", start: "2026-10-03T03:30:00Z", end: "2026-10-03T04:15:00Z",
      title: "D'Pras Barbershop · Potong Rambut, Hair Spa", location: "Jl. Contoh 1; Jakarta", now: new Date("2026-10-01T00:00:00Z") });
    expect(ics).toContain("DTSTART;TZID=Asia/Jakarta:20261003T103000\r\n");
    expect(ics).toContain("DTEND;TZID=Asia/Jakarta:20261003T111500\r\n");
    expect(ics).toContain("SUMMARY:D'Pras Barbershop · Potong Rambut\\, Hair Spa");
    expect(ics).toContain("LOCATION:Jl. Contoh 1\; Jakarta");
    expect(ics).toContain("TZOFFSETTO:+0700");
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n") && ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});

describe("captcha (server)", () => {
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.TURNSTILE_SECRET_KEY; });
  it("nonaktif tanpa secret; aktif: token wajib & diverifikasi", async () => {
    expect(await verifyTurnstile(null)).toBe(true);
    process.env.TURNSTILE_SECRET_KEY = "s";
    expect(await verifyTurnstile(null)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }))));
    expect(await verifyTurnstile("tok", "1.2.3.4")).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    expect(await verifyTurnstile("tok")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await verifyTurnstile("tok")).toBe(false);
  });
});
