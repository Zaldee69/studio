import { firstName } from "../domain/customer";
import { formatJam, formatRupiah, formatTanggal } from "../domain/format";

export type Template = "booking_confirmed" | "booking_pending" | "reminder_h1";
export type GroupInfo = {
  code: string; customerName: string; startAt: string; services: string[]; staff: string[];
  /** kategori layanan: barbershop → "kursi", nail → "meja" */
  categories: string[];
  /** total = hitungan kasir (calcCart) saat pesan dikirim; voucher = kode bila voucher yang dipakai */
  total: number; voucher: string | null;
  shop: { name: string; address: string; whatsapp: string; maps: string };
};
export type Rendered = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const and = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} dan ${xs.at(-1)}` : (xs[0] ?? ""));

/**
 * Pesan ke pelanggan, nada "hangat premium" (disetujui owner 26 Okt 2026). Email memakai teks yang sama,
 * kecuali ajakan membalas: balasan WA dibaca tim, balasan email belum tentu → arahkan ke WA studio.
 */
export function render(t: Template, g: GroupInfo, via: "whatsapp" | "email" = "whatsapp"): Rendered {
  const first = firstName(g.customerName);
  const hi = `Halo Kak${first ? ` ${first}` : ""},`;
  const day = formatTanggal(g.startAt), time = formatJam(g.startAt);
  const svc = and(g.services), staff = and(g.staff);
  const seat = and([...(g.categories.includes("barbershop") ? ["kursi"] : []), ...(g.categories.includes("nail") ? ["meja"] : [])]) || "jadwal";
  const reply = via === "email" && g.shop.whatsapp ? `lewat WhatsApp wa.me/${g.shop.whatsapp}` : "lewat pesan ini";
  const [subject, lines] = {
    booking_confirmed: [`Booking ${g.code} terkonfirmasi`, [
      hi, `${seat} Kakak sudah kami siapkan untuk ${day} pukul ${time}, ${svc}${staff ? ` bersama ${staff}` : ""}.`, "",
      `Saat tiba, cukup sebutkan nama atau tunjukkan kode booking ${g.code}. Totalnya ${formatRupiah(g.total)}${g.voucher ? ` setelah voucher ${g.voucher}` : ""}, dibayar di studio dengan tunai atau QRIS.`,
      ...(g.shop.address ? ["", `📍 ${g.shop.address}`, g.shop.maps] : []),
      "", "Sampai bertemu,", g.shop.name,
    ]],
    booking_pending: [`Booking ${g.code} kami terima`, [
      hi, `permintaan booking Kakak untuk ${day} pukul ${time} (${svc}) sudah kami terima.`, "",
      `Kami pastikan jadwalnya dulu, lalu segera mengabari Kakak${via === "whatsapp" ? " di nomor ini" : ""}.`,
    ]],
    reminder_h1: [`Pengingat: besok di ${g.shop.name}`, [
      hi, `sekadar mengingatkan, besok pukul ${time} ${staff || "kami"} sudah menunggu Kakak untuk ${svc}.`,
      ...(g.shop.maps ? ["", `📍 ${g.shop.maps}`] : []),
      "", `Jika besok Kakak berhalangan, kabari kami ${reply}, ya. Kami carikan waktu lain yang lebih pas.`,
    ]],
  }[t] as [string, string[]];
  const text = lines.join("\n");
  const html = `<div style="font-family:Georgia,serif;background:#0E0D0C;color:#F2EDE4;padding:32px"><h1 style="color:#C9A45C;font-weight:400">${esc(subject)}</h1>`
    + lines.map((l) => (l ? `<p style="margin:6px 0;font-family:Arial,sans-serif;font-size:15px">${esc(l)}</p>` : "<br>")).join("") + "</div>";
  return { subject, text, html };
}
