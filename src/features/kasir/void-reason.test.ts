import { expect, test } from "vitest";
import { noRefundReason } from "./void-reason";

test("noRefundReason", () => {
  expect(noRefundReason("Salah sumber bayar")).toBe(true);
  expect(noRefundReason("transaksi TEST")).toBe(true);
  expect(noRefundReason("pelanggan batal")).toBe(false);
});
