import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

// Audit SEC-2: isian publik (pelamar, pelanggan) tidak boleh jadi formula saat CSV dibuka di Excel.
describe("toCsv aman dari injeksi formula", () => {
  const line = (v: string | number) => toCsv([[v]]).slice(1, -2); // tanpa BOM & CRLF
  it("teks diawali = + - @ diberi awalan '", () => {
    expect(line("=1+1")).toBe("'=1+1");
    expect(line('=HYPERLINK("http://x","klik")')).toBe(`"'=HYPERLINK(""http://x"",""klik"")"`);
    expect(line("+62 812")).toBe("'+62 812");
    expect(line("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(line("-cmd")).toBe("'-cmd");
  });
  it("angka & teks angka murni tidak diubah", () => {
    expect(line(-5000)).toBe("-5000");
    expect(line("-5000")).toBe("-5000");
    expect(line("Budi")).toBe("Budi");
  });
});
