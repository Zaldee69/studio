// Perintah ESC/POS untuk printer struk thermal (58 mm = 32 kolom, 80 mm = 48 kolom, font A).
// Teks dipaksa ASCII: codepage bawaan printer murah (PC437) tidak punya "–", "·", "×", emoji.
import { METHOD_LABEL } from "./closing";
import { formatRupiah } from "./format";
import { cashChange, type Receipt } from "./receipt";

export type Paper = 58 | 80;
export const COLS: Record<Paper, number> = { 58: 32, 80: 48 };

const ESC = 0x1b, GS = 0x1d;
export const CMD = {
  init: [ESC, 0x40],
  left: [ESC, 0x61, 0], center: [ESC, 0x61, 1],
  bold: (on: boolean) => [ESC, 0x45, on ? 1 : 0],
  size: (w: 1 | 2, h: 1 | 2) => [GS, 0x21, ((w - 1) << 4) | (h - 1)],
  feed: (n: number) => [ESC, 0x64, n],
  cut: [GS, 0x56, 66, 0], // potong sebagian setelah feed; diabaikan printer tanpa pemotong
  drawer: [ESC, 0x70, 0, 25, 250], // pulsa ke port laci (pin 2)
};

export const ascii = (s: string) =>
  s.replace(/[–—−]/g, "-").replace(/[·•]/g, ".").replace(/×/g, "x").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7e\n]/g, "");

/** Bungkus per kata ke lebar `cols` (kata yang lebih panjang dipotong paksa). */
export function wrap(text: string, cols: number): string[] {
  const out: string[] = [];
  for (const para of ascii(text).split("\n")) {
    let line = "";
    for (let w of para.split(/\s+/).filter(Boolean)) {
      while (w.length > cols) { if (line) { out.push(line); line = ""; } out.push(w.slice(0, cols)); w = w.slice(cols); }
      if (!w) continue;
      if (!line) line = w;
      else if (line.length + 1 + w.length <= cols) line += " " + w;
      else { out.push(line); line = w; }
    }
    out.push(line);
  }
  return out;
}

/** Kiri-kanan dalam satu baris; bila tak muat, kiri dibungkus dan kanan rata kanan di baris terakhir/baris baru. */
export function lr(left: string, right: string, cols: number): string[] {
  const r = ascii(right);
  const lines = wrap(left, cols);
  const last = lines[lines.length - 1];
  if (last.length + 1 + r.length <= cols) lines[lines.length - 1] = last + " ".repeat(cols - last.length - r.length) + r;
  else lines.push(r.padStart(cols));
  return lines;
}

/** Penyusun byte: teks + perintah. */
export class Escpos {
  private parts: number[] = [];
  constructor(readonly cols: number) { this.cmd(CMD.init); }
  cmd(bytes: number[]) { this.parts.push(...bytes); return this; }
  text(s: string) { for (const ch of ascii(s)) this.parts.push(ch.charCodeAt(0)); return this; }
  line(s = "") { return this.text(s + "\n"); }
  lines(ls: string[]) { ls.forEach((l) => this.line(l)); return this; }
  rule(ch = "-") { return this.line(ch.repeat(this.cols)); }
  lr(l: string, r: string) { return this.lines(lr(l, r, this.cols)); }
  feed(n: number) { return this.cmd(CMD.feed(n)); }
  /** Teks besar (lebar ganda → setengah kolom) di tengah. */
  big(s: string) { return this.cmd(CMD.center).cmd(CMD.size(2, 2)).lines(wrap(s, Math.floor(this.cols / 2))).cmd(CMD.size(1, 1)).cmd(CMD.left); }
  end(opts: { drawer?: boolean } = {}) {
    this.cmd(CMD.feed(4)).cmd(CMD.cut);
    if (opts.drawer) this.cmd(CMD.drawer);
    return Uint8Array.from(this.parts);
  }
}

const rp = formatRupiah;
const waDisplay = (wa: string) => (wa.startsWith("62") ? `0${wa.slice(2)}` : wa);

/** Struk pembayaran — isi sama dengan struk layar (ReceiptPaper). */
export function receiptEscpos(r: Receipt, o: { paper: Paper; voided?: string | null; site?: string; drawer?: boolean }): Uint8Array {
  const p = new Escpos(COLS[o.paper]);
  const change = cashChange(r.paid, r.cashReceived);
  p.big(r.shop.toUpperCase()).cmd(CMD.center);
  if (r.shopAddress) p.lines(wrap(r.shopAddress, p.cols));
  const contact = [r.shopWhatsapp && `WA ${waDisplay(r.shopWhatsapp)}`, r.shopInstagram && `IG @${r.shopInstagram.replace(/^@/, "")}`].filter(Boolean).join("  ");
  if (contact) p.lines(wrap(contact, p.cols));
  p.cmd(CMD.left).rule();
  if (o.voided) p.cmd(CMD.center).cmd(CMD.bold(true)).line("*** DIBATALKAN (VOID) ***").cmd(CMD.bold(false)).lines(wrap(`Alasan: ${o.voided}`, p.cols)).cmd(CMD.left).rule();
  if (r.no) p.lr("No. struk", `#${r.no}`);
  p.lr("Tanggal", r.when).lr("Pelanggan", r.customer);
  if (r.cashier) p.lr("Kasir", r.cashier);
  p.rule();
  for (const it of r.items) {
    p.lr(it.name, rp(it.price));
    if (it.staff) p.line(`  oleh ${it.staff}`);
  }
  p.rule().lr("Subtotal", rp(r.subtotal));
  if (r.discount > 0) p.lr(r.discountLabel || "Diskon", `-${rp(r.discount)}`);
  if (r.depositUsed > 0) p.lr("Potong saldo deposit", `-${rp(r.depositUsed)}`);
  p.rule("=").cmd(CMD.bold(true)).cmd(CMD.size(1, 2)).lr("TOTAL", rp(r.paid + r.depositUsed)).cmd(CMD.size(1, 1)).cmd(CMD.bold(false)).rule("=");
  p.lr(`Dibayar (${METHOD_LABEL[r.method]})`, rp(r.paid));
  if (r.cashReceived != null) p.lr("Uang diterima", rp(r.cashReceived));
  if (change != null) p.cmd(CMD.bold(true)).lr("Kembalian", rp(change)).cmd(CMD.bold(false));
  if (r.balanceAfter != null && (r.depositUsed > 0 || r.balanceAfter > 0)) p.lr("Sisa saldo deposit", rp(r.balanceAfter));
  p.rule().cmd(CMD.center).cmd(CMD.bold(true)).line("Terima kasih, sampai jumpa lagi!").cmd(CMD.bold(false));
  if (o.site) p.lines(wrap(`Booking online: ${o.site}/booking`, p.cols));
  p.lines(wrap("Simpan struk ini sebagai bukti bayar.", p.cols)).cmd(CMD.left);
  return p.end({ drawer: o.drawer });
}

export type ClosingSummary = {
  tx_count: number; gross_total: number; discount_total: number; cash_sales: number; qris_sales: number; deposit_used: number;
  topup_cash: number; topup_qris: number; topup_credited: number; topup_count: number; expected_cash: number;
  voided: { created_at: string; total: number; reason: string }[];
};

/** Rekap tutup kasir; `last` = penutupan terakhir (kas fisik & selisih) bila sudah disimpan. */
export function closingEscpos(s: ClosingSummary, o: {
  paper: Paper; shop: string; date: string; printedAt: string; cashier?: string | null; time: (iso: string) => string;
  last?: { at: string; physical_cash: number; difference: number | null; note: string | null } | null;
}): Uint8Array {
  const p = new Escpos(COLS[o.paper]);
  p.big("REKAP KASIR").cmd(CMD.center).lines(wrap(o.shop, p.cols)).line(o.date).cmd(CMD.left).rule();
  p.lr("Jumlah transaksi", String(s.tx_count)).lr("Omzet (stlh diskon)", rp(s.gross_total)).lr("Total diskon", rp(s.discount_total))
    .lr("Penjualan Tunai", rp(s.cash_sales)).lr("Penjualan QRIS", rp(s.qris_sales)).lr("Deposit terpakai", rp(s.deposit_used))
    .lr(`Top-up Tunai (${s.topup_count}x)`, rp(s.topup_cash)).lr("Top-up QRIS", rp(s.topup_qris)).lr("Saldo deposit masuk", rp(s.topup_credited));
  p.rule("=").cmd(CMD.bold(true)).lr("KAS DIHARAPKAN", rp(s.expected_cash)).cmd(CMD.bold(false)).rule("=");
  if (o.last) {
    p.lr(`Kas fisik (${o.time(o.last.at)})`, rp(o.last.physical_cash))
      .cmd(CMD.bold(true)).lr("Selisih", `${(o.last.difference ?? 0) > 0 ? "+" : ""}${rp(o.last.difference ?? 0)}`).cmd(CMD.bold(false));
    if (o.last.note) p.lines(wrap(`Catatan: ${o.last.note}`, p.cols));
  } else p.line("Kas fisik belum dicatat.");
  p.rule().line("Transaksi void:");
  if (!s.voided.length) p.line("  Tidak ada.");
  for (const v of s.voided) p.lr(`  ${o.time(v.created_at)} ${v.reason}`, rp(v.total));
  p.rule().lr("Dicetak", o.printedAt);
  if (o.cashier) p.lr("Oleh", o.cashier);
  p.feed(2).line("Tanda tangan kasir:").feed(3).line("_".repeat(Math.min(24, p.cols)));
  return p.end();
}
