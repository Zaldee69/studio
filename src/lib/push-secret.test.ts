import { afterEach, describe, expect, it } from "vitest";
import { pushSecretOk } from "./push-secret";

// Audit SEC-6 (1 Nov): secret webhook dicek waktu-konstan; kosong/beda ditolak.
describe("x-push-secret", () => {
  const old = process.env.PUSH_SECRET;
  afterEach(() => { process.env.PUSH_SECRET = old; });
  it("cocok → lolos; beda, kosong, atau secret belum diisi → ditolak", () => {
    process.env.PUSH_SECRET = "rahasia-panjang-uji-1234567890";
    expect(pushSecretOk("rahasia-panjang-uji-1234567890")).toBe(true);
    expect(pushSecretOk("rahasia-panjang-uji-123456789")).toBe(false);
    expect(pushSecretOk(null)).toBe(false);
    process.env.PUSH_SECRET = "";
    expect(pushSecretOk("")).toBe(false);
  });
});
