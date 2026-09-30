export type ApptStatus = "pending_review" | "booked" | "arrived" | "in_service" | "completed" | "paid" | "no_show" | "cancelled";

/** Warna status kunjungan: latar / titik / teks. Selalu tampilkan bersama label. */
export const STATUS: Record<ApptStatus, { label: string; short: string; bg: string; dot: string; fg: string; bd: string }> = {
  pending_review: { label: "Menunggu konfirmasi", short: "Menunggu", bg: "#FFFFFF", dot: "#8F897D", fg: "#4A463F", bd: "#8F897D" },
  booked: { label: "Booked", short: "Booked", bg: "#FFF1C2", dot: "#C99500", fg: "#5A4300", bd: "#EBCB67" },
  arrived: { label: "Datang/Menunggu", short: "Datang", bg: "#DCEBFF", dot: "#2F6FD6", fg: "#163D78", bd: "#A9C9F5" },
  in_service: { label: "Sedang Dilayani", short: "Mulai", bg: "#FFE2CC", dot: "#E06C1A", fg: "#6B3000", bd: "#F2B488" },
  completed: { label: "Selesai/Belum Bayar", short: "Selesai", bg: "#FFDADA", dot: "#D23B3B", fg: "#6E1616", bd: "#EFA3A3" },
  paid: { label: "Lunas", short: "Lunas", bg: "#D9F2E1", dot: "#2E9657", fg: "#144D2A", bd: "#9ED7B2" },
  no_show: { label: "Tidak datang", short: "Tak datang", bg: "#F3E8E8", dot: "#8A3B3B", fg: "#5A1F1F", bd: "#D8B4B4" },
  cancelled: { label: "Batal", short: "Batal", bg: "#EEEBE4", dot: "#8F897D", fg: "#4A463F", bd: "#D9D4C8" },
};

/** Urutan alur layanan (tanpa paid/cancelled) — dipakai tombol status satu langkah. */
export const FLOW: ApptStatus[] = ["booked", "arrived", "in_service", "completed"];

/** Langkah berikutnya yang boleh lewat advance_appointment_status(). 'paid' hanya lewat checkout. */
export function nextStatus(s: ApptStatus): ApptStatus | null {
  const i = FLOW.indexOf(s);
  return i >= 0 && i < FLOW.length - 1 ? FLOW[i + 1] : null;
}
