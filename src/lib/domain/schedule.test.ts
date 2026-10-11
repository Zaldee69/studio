import { describe, expect, it } from "vitest";
import { conflictingIds, findConflicts, occupiedEnd } from "./schedule";

const at = (t: string) => `2026-10-11T${t}:00+07:00`;
// Kasus prod 11/10: potong 10.15–11.00 selesai 10.29 → walk-in 10.45 di kursi & kapster yang sama bukan bentrok.
const done = { id: "1", resource_id: "k1", staff_id: "obay", start_at: at("10:15"), end_at: at("11:00"), status: "paid", service_ended_at: at("10:29") };
const next = { id: "2", resource_id: "k1", staff_id: "obay", start_at: at("10:45"), end_at: at("11:30"), status: "booked" };

describe("slot dilepas di jam selesai sebenarnya", () => {
  it("selesai/lunas → jam selesai aktual; lainnya → jadwal", () => {
    expect(occupiedEnd(done)).toBe(Date.parse(at("10:29")));
    expect(occupiedEnd({ ...done, status: "in_service" })).toBe(Date.parse(at("11:00")));
    expect(occupiedEnd({ ...done, service_ended_at: at("10:00") })).toBe(Date.parse(at("10:15"))); // tidak sebelum mulai
  });
  it("walk-in setelah selesai lebih cepat bukan bentrok", () => {
    expect(conflictingIds([done, next]).size).toBe(0);
    expect(findConflicts([done], { resourceId: "k1", staffId: "obay", start: at("10:45"), end: at("11:30") })).toEqual([]);
  });
  it("label bentrok juga untuk staf sama di kursi berbeda", () => {
    expect([...conflictingIds([{ ...next, id: "a" }, { ...next, id: "b", resource_id: "k2" }])].sort()).toEqual(["a", "b"]);
  });
});
