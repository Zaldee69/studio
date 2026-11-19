export type ApptStatus = "pending_review" | "booked" | "arrived" | "in_service" | "completed" | "paid" | "no_show" | "cancelled";

/** Warna status kunjungan: latar / titik / teks. Selalu tampilkan bersama label. */
export const STATUS: Record<ApptStatus, { label: string; short: string; bg: string; dot: string; fg: string; bd: string }> = {
  pending_review: { label: "Menunggu konfirmasi", short: "Menunggu", bg: "#FFFFFF", dot: "#8E908A", fg: "#4A4C46", bd: "#8E908A" },
  booked: { label: "Terjadwal", short: "Terjadwal", bg: "#B1DDF5", dot: "#2B7FB8", fg: "#10304A", bd: "#8CC8E8" },
  arrived: { label: "Datang, menunggu", short: "Datang", bg: "#86D4CC", dot: "#12877B", fg: "#0A3B36", bd: "#62C0B6" },
  in_service: { label: "Sedang dilayani", short: "Mulai", bg: "#F5C277", dot: "#C77A0A", fg: "#4A2C00", bd: "#E7AA4F" },
  completed: { label: "Selesai, belum bayar", short: "Selesai", bg: "#F2A3BF", dot: "#C23A6B", fg: "#5A0F2E", bd: "#E582A6" },
  paid: { label: "Lunas", short: "Lunas", bg: "#B5E3BF", dot: "#268052", fg: "#0F3B22", bd: "#92D1A0" },
  no_show: { label: "Tidak datang", short: "Tak datang", bg: "#E3D3D6", dot: "#8A5A5A", fg: "#4F2E2E", bd: "#CDB6BA" },
  cancelled: { label: "Batal", short: "Batal", bg: "#E4E6EA", dot: "#8A909B", fg: "#454B55", bd: "#CDD1D8" },
};

/** Urutan alur layanan (tanpa paid/cancelled) — dipakai tombol status satu langkah. */
export const FLOW: ApptStatus[] = ["booked", "arrived", "in_service", "completed"];

/**
 * Perpindahan status yang boleh lewat set_appointment_status (sama dengan aturan di DB, audit BOOK-5 1 Nov): maju satu
 * langkah atau mundur satu langkah; tidak lompat ke Selesai tanpa Dilayani (jam layanan tercatat). Tidak datang → Terjadwal
 * hanya manajer (dicek DB).
 */
export const MOVES: Partial<Record<ApptStatus, ApptStatus[]>> = {
  booked: ["arrived", "in_service"], arrived: ["booked", "in_service"], in_service: ["arrived", "completed"],
  completed: ["in_service"], no_show: ["booked"],
};
export const canMove = (from: ApptStatus, to: ApptStatus) => !!MOVES[from]?.includes(to);

/** Langkah berikutnya yang boleh lewat advance_appointment_status(). 'paid' hanya lewat checkout. */
export function nextStatus(s: ApptStatus): ApptStatus | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}
