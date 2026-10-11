import { describe, expect, it } from "vitest";
import { ascii, closingEscpos, CMD, lr, rasterCmd, receiptEscpos, wrap } from "./escpos";
import type { Receipt } from "./receipt";

const str = (b: Uint8Array) => String.fromCharCode(...b);
const has = (b: Uint8Array, seq: number[]) => str(b).includes(String.fromCharCode(...seq));

const r: Receipt = {
  shop: "D'Pras Barbershop", shopAddress: "Jl. Contoh No. 1, Jakarta", shopWhatsapp: "6281234567890", shopInstagram: "dpras.barbershop",
  no: "AB12CD34", when: "Senin, 5 Okt 2026 10.00", customer: "Rina", cashier: "Kasir",
  items: [{ name: "Potong + Cuci + Styling Premium Extra Panjang", price: 95000, staff: "Andi" }, { name: "Cukur Jenggot", price: 45000 }],
  subtotal: 140000, discount: 14000, discountLabel: "Diskon paket 10%", depositUsed: 0,
  paid: 126000, method: "cash", cashReceived: 150000, balanceAfter: null,
};

describe("escpos", () => {
  it("ascii: tanda baca khusus → ASCII, sisanya dibuang", () => {
    expect(ascii("10.00–10.45 · 2× — café 🙏")).toBe("10.00-10.45 . 2x - cafe ");
  });

  it("wrap & lr tidak pernah melebihi lebar kertas", () => {
    for (const cols of [32, 48]) {
      for (const l of wrap("Potong + Cuci + Styling Premium Extra Panjang Sekali Untuk Uji", cols)) expect(l.length).toBeLessThanOrEqual(cols);
      for (const l of lr("Potong + Cuci + Styling Premium Extra Panjang", "Rp1.250.000", cols)) expect(l.length).toBeLessThanOrEqual(cols);
    }
    expect(lr("Subtotal", "Rp140.000", 32)).toEqual(["Subtotal" + " ".repeat(32 - 8 - 9) + "Rp140.000"]);
    expect(wrap("ABCDEFGHIJ", 4)).toEqual(["ABCD", "EFGH", "IJ"]);
  });

  it("struk: isi, kembalian, potong kertas; laci hanya bila diminta", () => {
    const b = receiptEscpos(r, { paper: 58, site: "groombloom.id" });
    const t = str(b);
    for (const s of ["Barbershop", "#AB12CD34", "TOTAL", "Rp126.000", "Kembalian", "Rp24.000", "oleh Andi", "groombloom.id/booking", "WA 081234567890"]) expect(t).toContain(s);
    expect(has(b, CMD.init)).toBe(true);
    expect(has(b, CMD.cut)).toBe(true);
    expect(has(b, CMD.drawer)).toBe(false);
    expect(has(receiptEscpos(r, { paper: 80, drawer: true }), CMD.drawer)).toBe(true);
    expect(t).not.toMatch(/[^\x00-\x7f]/);
    // setiap baris cetak (tanpa byte perintah) muat di kertas; header besar = lebar ganda
    const text = t.replace(/\x1b@|\x1b[aEd][\s\S]|\x1d![\s\S]|\x1dV[\s\S]{2}/g, "");
    for (const l of text.split("\n")) expect(l.length, l).toBeLessThanOrEqual(32);
  });

  it("logo: GS v 0, 8 piksel per byte (MSB = kiri), dicetak sebelum nama toko", () => {
    const dark = [...Array(8)].map((_, i) => i === 0).concat([...Array(8)].map((_, i) => i === 7)); // 8×2
    const cmd = rasterCmd(dark, 8, 2);
    expect(cmd).toEqual([0x1d, 0x76, 0x30, 0, 1, 0, 2, 0, 0x80, 0x01]);
    const bytes = Array.from(receiptEscpos(r, { paper: 58, logo: cmd }));
    const at = bytes.findIndex((b, i) => b === 0x1d && bytes[i + 1] === 0x76);
    expect(at).toBe(CMD.init.length + CMD.center.length); // paling atas: init → rata tengah → logo
  });

  it("struk void ditandai", () => {
    expect(str(receiptEscpos(r, { paper: 80, voided: "Salah input" }))).toContain("DIBATALKAN (VOID)");
  });

  it("rekap tutup kasir: kas diharapkan & selisih", () => {
    const t = str(closingEscpos({
      tx_count: 4, gross_total: 594500, discount_total: 20000, cash_sales: 300000, qris_sales: 294500, deposit_used: 0,
      topup_cash: 500000, topup_qris: 0, topup_credited: 550000, topup_count: 1, expense_cash: 25000, expense_count: 1, tip_qris: 0, tip_count: 0, expected_cash: 775000,
      voided: [{ created_at: "2026-10-05T03:00:00Z", total: 75000, reason: "Salah input" }],
    }, { paper: 58, shop: "D'Pras Barbershop", date: "Senin, 5 Okt 2026", printedAt: "21.00", time: () => "10.00",
      last: { at: "2026-10-05T14:00:00Z", physical_cash: 770000, difference: -5000, note: null } }));
    for (const s of ["REKAP KASIR", "KAS DIHARAPKAN", "-Rp25.000", "Rp775.000", "Rp770.000", "-Rp5.000", "Salah input", "Tanda tangan"]) expect(t).toContain(s);
  });
});
