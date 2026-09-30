import { describe, expect, it } from "vitest";
import { actualMinutes, approvedOffFor, commissionOnDay, pickCurrent, revertRemaining, serviceTimer, staffCanMove } from "./staff";
import type { ApptStatus } from "./status";

const a = (id: string, status: ApptStatus, hh: string) => ({ id, status, start_at: `2026-10-01T${hh}:00+07:00` });

describe("kapster: pelanggan berikutnya", () => {
  const today = [a("1", "booked", "13:00"), a("2", "booked", "10:00"), a("3", "arrived", "11:00"), a("4", "completed", "09:00")];
  it("in_service → arrived → booked terdekat; pilihan manual menang", () => {
    expect(pickCurrent(today, null)?.id).toBe("3");
    expect(pickCurrent([...today, a("5", "in_service", "12:00")], null)?.id).toBe("5");
    expect(pickCurrent(today.filter((x) => x.status !== "arrived"), null)?.id).toBe("2");
    expect(pickCurrent(today, "4")?.id).toBe("4");
    expect(pickCurrent([a("9", "paid", "09:00")], null)).toBeNull();
  });
});

describe("kapster: transisi & koreksi", () => {
  it("maju/mundur satu langkah, tidak pernah ke paid", () => {
    expect(staffCanMove("booked", "arrived")).toBe(true);
    expect(staffCanMove("in_service", "completed")).toBe(true);
    expect(staffCanMove("in_service", "arrived")).toBe(true);
    expect(staffCanMove("booked", "in_service")).toBe(false);
    expect(staffCanMove("completed", "paid")).toBe(false);
    expect(staffCanMove("arrived", "cancelled")).toBe(false);
  });
  it("jendela koreksi 10 menit, hanya perubahan sendiri", () => {
    const now = Date.parse("2026-10-01T10:10:00+07:00");
    const x = (at: string | null, me = true, status: ApptStatus = "in_service") => ({ status, status_changed_at: at, changed_by_me: me });
    expect(revertRemaining(x("2026-10-01T10:05:00+07:00"), now)).toBe(5 * 60000);
    expect(revertRemaining(x("2026-10-01T09:59:00+07:00"), now)).toBe(0);
    expect(revertRemaining(x("2026-10-01T10:05:00+07:00", false), now)).toBe(0);
    expect(revertRemaining(x(null), now)).toBe(0);
    expect(revertRemaining(x("2026-10-01T10:05:00+07:00", true, "booked"), now)).toBe(0);
  });
  it("timer & durasi nyata", () => {
    const now = Date.parse("2026-10-01T11:00:00+07:00");
    expect(serviceTimer("2026-10-01T10:10:00+07:00", 45, now)).toEqual({ elapsedMin: 50, over: true, overBy: 5 });
    expect(serviceTimer("2026-10-01T10:30:00+07:00", 45, now).over).toBe(false);
    expect(actualMinutes("2026-10-01T10:34:00+07:00", "2026-10-01T11:21:00+07:00")).toBe(47);
    expect(actualMinutes(null, "2026-10-01T11:21:00+07:00")).toBeNull();
  });
});

describe("kapster: komisi & izin", () => {
  it("estimasi komisi hari ini (zona Jakarta)", () => {
    const items = [
      { created_at: "2026-10-01T02:00:00Z", commission: 26480 },   // 09.00 WIB 1 Okt
      { created_at: "2026-09-30T18:30:00Z", commission: 1000.4 },  // 01.30 WIB 1 Okt
      { created_at: "2026-09-30T16:00:00Z", commission: 5000 },    // 23.00 WIB 30 Sep
    ];
    expect(commissionOnDay(items, "2026-10-01")).toBe(27480);
    expect(commissionOnDay(items, "2026-09-30")).toBe(5000);
  });
  it("izin disetujui yang tumpang tindih", () => {
    const offs = [
      { staff_id: "andi", start_at: "2026-10-02T00:00:00+07:00", end_at: "2026-10-03T00:00:00+07:00", status: "approved" },
      { staff_id: "sari", start_at: "2026-10-02T13:00:00+07:00", end_at: "2026-10-02T15:00:00+07:00", status: "pending" },
    ];
    expect(approvedOffFor(offs, "andi", "2026-10-02T10:00:00+07:00", "2026-10-02T10:45:00+07:00")).toBeTruthy();
    expect(approvedOffFor(offs, "andi", "2026-10-03T10:00:00+07:00", "2026-10-03T10:45:00+07:00")).toBeUndefined();
    expect(approvedOffFor(offs, "sari", "2026-10-02T13:30:00+07:00", "2026-10-02T14:00:00+07:00")).toBeUndefined();
  });
});
