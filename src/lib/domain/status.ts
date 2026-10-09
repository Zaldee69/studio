export type ApptStatus = "pending_review" | "booked" | "arrived" | "in_service" | "completed" | "paid" | "no_show" | "cancelled";

/** Warna status kunjungan: latar / titik / teks. Selalu tampilkan bersama label. */
export const STATUS: Record<ApptStatus, { label: string; short: string; bg: string; dot: string; fg: string; bd: string }> = {
  pending_review: { label: "Menunggu konfirmasi", short: "Menunggu", bg: "#FFFFFF", dot: "#8E908A", fg: "#4A4C46", bd: "#8E908A" },
  booked: { label: "Booked", short: "Booked", bg: "#FBF6E8", dot: "#B08A2E", fg: "#5C4A1A", bd: "#E8DDC0" },
  arrived: { label: "Datang/Menunggu", short: "Datang", bg: "#EEF3F7", dot: "#4F7A9A", fg: "#24435A", bd: "#C9D7E2" },
  in_service: { label: "Sedang Dilayani", short: "Mulai", bg: "#FBEFE8", dot: "#C0683A", fg: "#6B3416", bd: "#EBCDBB" },
  completed: { label: "Selesai/Belum Bayar", short: "Selesai", bg: "#FAEEEE", dot: "#B5474A", fg: "#6B2427", bd: "#E8C3C4" },
  paid: { label: "Lunas", short: "Lunas", bg: "#EEF4ED", dot: "#5E8A5A", fg: "#2C4A2A", bd: "#C9DBC6" },
  no_show: { label: "Tidak datang", short: "Tak datang", bg: "#F6F1F1", dot: "#8A5A5A", fg: "#4F2E2E", bd: "#DCCACA" },
  cancelled: { label: "Batal", short: "Batal", bg: "#F3F3F1", dot: "#9A9C95", fg: "#55574F", bd: "#DEDED9" },
};

/** Urutan alur layanan (tanpa paid/cancelled) — dipakai tombol status satu langkah. */
export const FLOW: ApptStatus[] = ["booked", "arrived", "in_service", "completed"];

/** Langkah berikutnya yang boleh lewat advance_appointment_status(). 'paid' hanya lewat checkout. */
export function nextStatus(s: ApptStatus): ApptStatus | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}
