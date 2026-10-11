import { expect, it } from "vitest";
import { apptName, receiptName } from "./guest";

it("nama: pelanggan > nama panggilan walk-in > default", () => {
  expect(apptName({ customer: { name: "Rina" }, guest_name: "X" })).toBe("Rina");
  expect(apptName({ customer: null, guest_name: "Budi" })).toBe("Budi (walk-in)");
  expect(apptName({ customer: null, guest_name: null })).toBe("Walk-in");
  expect(receiptName(null, [null, "Budi"])).toBe("Budi");
  expect(receiptName(null, [])).toBe("Pelanggan umum");
});
