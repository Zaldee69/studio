import { describe, expect, it } from "vitest";
import type { DayAppt } from "../counter/types";
import { queueStart, walkInTurn } from "./turn";

const appt = (staff_id: string, source: DayAppt["source"], end: string, status: DayAppt["status"] = "paid") =>
  ({ staff_id, source, status, end_at: end, service_ended_at: null } as DayAppt);

describe("giliran walk-in", () => {
  it("staf dengan walk-in paling sedikit hari ini dapat giliran, per kategori", () => {
    const staff = [{ id: "abdu", category: "massage", free: true }, { id: "ridwan", category: "massage", free: true },
      { id: "obay", category: "barbershop", free: true }, { id: "nicko", category: "barbershop", free: true }];
    const appts = [appt("ridwan", "walk_in", "2026-11-02T03:00:00Z"), appt("obay", "walk_in", "2026-11-02T03:00:00Z"),
      appt("nicko", "walk_in", "2026-11-02T04:00:00Z"), appt("nicko", "online", "2026-11-02T05:00:00Z")];
    expect(walkInTurn(staff, appts)).toEqual({ massage: "abdu", barbershop: "obay" });
  });
  it("seri → yang paling lama menganggur; staf sibuk dilewati; booking batal tidak dihitung", () => {
    const appts = [appt("obay", "walk_in", "2026-11-02T05:00:00Z"), appt("nicko", "walk_in", "2026-11-02T03:00:00Z"),
      appt("nicko", "walk_in", "2026-11-02T02:00:00Z", "cancelled")];
    expect(walkInTurn([{ id: "obay", category: "barbershop", free: true }, { id: "nicko", category: "barbershop", free: true }], appts))
      .toEqual({ barbershop: "nicko" });
    expect(walkInTurn([{ id: "obay", category: "barbershop", free: true }, { id: "nicko", category: "barbershop", free: false }], appts))
      .toEqual({ barbershop: "obay" });
  });
});

describe("jam mulai antre walk-in (tidak menimpa booking)", () => {
  const at = (h: string) => Date.parse(`2026-11-02T${h}:00+07:00`);
  const a = (start: string, end: string, status: DayAppt["status"], staff_id = "obay") =>
    ({ staff_id, status, start_at: new Date(at(start)).toISOString(), end_at: new Date(at(end)).toISOString() } as DayAppt);
  it("antre setelah yang sedang dilayani", () => {
    expect(queueStart([a("10:00", "10:30", "in_service")], "obay", at("10:10"), 30)).toBe(at("10:30"));
  });
  it("antre ke-2 setelah antre ke-1", () => {
    expect(queueStart([a("10:00", "10:30", "in_service"), a("10:30", "11:00", "arrived")], "obay", at("10:10"), 30)).toBe(at("11:00"));
  });
  it("celah lebih pendek dari durasi dilewati — mulai setelah booking online", () => {
    expect(queueStart([a("10:00", "10:30", "in_service"), a("10:45", "11:15", "booked")], "obay", at("10:10"), 30)).toBe(at("11:15"));
  });
  it("celah cukup dipakai; booking staf lain & yang sudah dibayar diabaikan", () => {
    expect(queueStart([a("10:00", "10:30", "in_service"), a("11:30", "12:00", "booked"), a("10:30", "11:00", "booked", "nicko"),
      a("09:00", "09:30", "paid")], "obay", at("10:10"), 30)).toBe(at("10:30"));
  });
});
