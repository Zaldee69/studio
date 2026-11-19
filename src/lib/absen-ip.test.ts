import { describe, expect, it } from "vitest";
import { clientIp, normalizeIp } from "./absen-ip";

describe("normalizeIp", () => {
  it("IPv4 apa adanya", () => expect(normalizeIp(" 103.10.1.5 ")).toBe("103.10.1.5"));
  it("IPv4-mapped", () => expect(normalizeIp("::ffff:103.10.1.5")).toBe("103.10.1.5"));
  it("IPv6 satu jaringan /64 sama", () => {
    expect(normalizeIp("2400:6180:0:d0::1a2b")).toBe(normalizeIp("2400:6180:0:d0:aaaa:bbbb:cccc:dddd"));
    expect(normalizeIp("2400:6180:0:d0::1")).not.toBe(normalizeIp("2400:6180:0:d1::1"));
  });
  it("header kosong", () => expect(clientIp(new Headers())).toBe(""));
  it("ambil IP pertama x-forwarded-for", () => expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4"));
});
