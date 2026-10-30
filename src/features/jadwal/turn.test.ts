import { describe, expect, it } from "vitest";
import type { DayAppt } from "../counter/types";
import { walkInTurn } from "./turn";

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
