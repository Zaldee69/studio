import { describe, expect, it } from "vitest";
import { readDeviceInfo } from "./wablas-status";

describe("readDeviceInfo", () => {
  it("tersambung", () => {
    const r = readDeviceInfo(true, { status: true, data: { status: "connected", active: true, expired_date: "2026-12-01", quota: 91, sender: "6281" } });
    expect(r).toMatchObject({ ok: true, connected: true, expired: "2026-12-01", quota: 91 });
  });
  it("terputus atau nonaktif", () => {
    expect(readDeviceInfo(true, { status: true, data: { status: "disconnected", active: true } })).toMatchObject({ ok: true, connected: false });
    expect(readDeviceInfo(true, { status: true, data: { status: "connected", active: false } })).toMatchObject({ ok: true, connected: false });
  });
  it("gagal memeriksa bukan berarti terputus", () => {
    expect(readDeviceInfo(false, null)).toMatchObject({ ok: false, connected: false });
    expect(readDeviceInfo(true, { status: false, message: "token salah" })).toMatchObject({ ok: false, detail: "token salah" });
  });
});
