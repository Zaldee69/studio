import { formatJam, formatTanggal } from "../domain/format";

export type Template = "booking_confirmed" | "booking_pending" | "reminder_h1";
export type GroupInfo = {
  code: string; customerName: string; startAt: string; services: string[]; staff: string[];
  shop: { name: string; address: string; whatsapp: string };
};
export type Rendered = { subject: string; text: string; html: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Pesan ke pelanggan (email & WhatsApp memakai teks yang sama). */
export function render(t: Template, g: GroupInfo): Rendered {
  const first = g.customerName.trim().split(/\s+/)[0] || "Kak";
  const when = `${formatTanggal(g.startAt)} pukul ${formatJam(g.startAt)} WIB`;
  const head = {
    booking_confirmed: [`Booking ${g.code} terkonfirmasi`, `Halo ${first}, booking Anda di ${g.shop.name} sudah terkonfirmasi.`],
    booking_pending: [`Booking ${g.code} kami terima`, `Halo ${first}, booking Anda di ${g.shop.name} kami terima dan sedang dikonfirmasi toko. Kami kabari segera.`],
    reminder_h1: [`Pengingat: besok di ${g.shop.name}`, `Halo ${first}, sampai jumpa besok di ${g.shop.name}!`],
  }[t];
  const lines = [
    head[1], "",
    `Kode booking: ${g.code}`, `Waktu: ${when}`, `Layanan: ${g.services.join(", ")}`,
    ...(g.staff.length ? [`Kapster/nail artist: ${g.staff.join(", ")}`] : []),
    ...(g.shop.address ? [`Alamat: ${g.shop.address}`] : []),
    "", "Bayar di toko: tunai, QRIS, atau saldo deposit. Mohon datang 5 menit lebih awal.",
    ...(g.shop.whatsapp ? [`Perlu ubah jadwal? Balas / chat WhatsApp ${g.shop.whatsapp}.`] : []),
  ];
  const text = lines.join("\n");
  const html = `<div style="font-family:Georgia,serif;background:#0E0D0C;color:#F2EDE4;padding:32px"><h1 style="color:#C9A45C;font-weight:400">${esc(head[0])}</h1>`
    + lines.map((l) => (l ? `<p style="margin:6px 0;font-family:Arial,sans-serif;font-size:15px">${esc(l)}</p>` : "<br>")).join("") + "</div>";
  return { subject: head[0], text, html };
}
