// Aplikasi kapster: urutan antrean, aksi satu ketukan, jendela koreksi, timer, estimasi komisi, izin.
// Cermin revert_my_status / advance_appointment_status / commission_items di SQL.
import { formatJam, formatTanggal, jktDate } from "./format";
import { nextStatus, type ApptStatus } from "./status";

export const REVERT_WINDOW_MS = 10 * 60 * 1000;

type QAppt = { id: string; status: ApptStatus; start_at: string };

/** Kartu besar: pilihan manual → in_service → arrived → booked terdekat. */
export function pickCurrent<T extends QAppt>(today: T[], selectedId: string | null): T | null {
  const sel = selectedId ? today.find((a) => a.id === selectedId) : undefined;
  if (sel) return sel;
  const by = (s: ApptStatus) => today.filter((a) => a.status === s).sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
  return by("in_service") ?? by("arrived") ?? by("booked") ?? null;
}

export const ACTION: Partial<Record<ApptStatus, { label: string; bg: string }>> = {
  booked: { label: "Pelanggan datang", bg: "#2F6FD6" },
  arrived: { label: "Mulai layanan", bg: "#1C1B19" },
  in_service: { label: "Selesai → ke kasir", bg: "#1F7A45" },
};

/** Transisi yang boleh dilakukan kapster: maju satu langkah (tidak ke paid) atau mundur satu langkah. */
export function staffCanMove(from: ApptStatus, to: ApptStatus): boolean {
  if (to === "paid" || to === "cancelled") return false;
  return nextStatus(from) === to || nextStatus(to) === from;
}

/** Sisa waktu (ms) untuk "Batalkan status terakhir"; 0 = tidak bisa. */
export function revertRemaining(a: { status: ApptStatus; status_changed_at: string | null; changed_by_me: boolean | null }, now: number): number {
  if (!a.changed_by_me || !a.status_changed_at || !["arrived", "in_service", "completed"].includes(a.status)) return 0;
  return Math.max(0, Date.parse(a.status_changed_at) + REVERT_WINDOW_MS - now);
}

/** Timer layanan berjalan vs durasi rencana. */
export function serviceTimer(startedAt: string, plannedMin: number, now: number) {
  const elapsedMin = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 60000));
  return { elapsedMin, over: elapsedMin > plannedMin, overBy: Math.max(0, elapsedMin - plannedMin) };
}

/** Durasi nyata (menit) bila mulai & selesai tercatat, selain itu null (pakai durasi rencana). */
export const actualMinutes = (start: string | null, end: string | null) =>
  start && end ? Math.round((Date.parse(end) - Date.parse(start)) / 60000) : null;

/** Estimasi komisi satu hari (Asia/Jakarta) dari rincian commission_items. */
export function commissionOnDay(items: { created_at: string; commission: number }[], day: string): number {
  return Math.round(items.filter((i) => jktDate(new Date(i.created_at)) === day).reduce((a, i) => a + Number(i.commission), 0));
}

type Off = { staff_id: string; start_at: string; end_at: string; status: string };
/** Izin yang disetujui & tumpang tindih rentang [start, end). */
export function approvedOffFor<T extends Off>(offs: T[], staffId: string | null, start: string, end: string): T | undefined {
  if (!staffId) return undefined;
  const s = Date.parse(start), e = Date.parse(end);
  return offs.find((o) => o.staff_id === staffId && o.status === "approved" && Date.parse(o.start_at) < e && Date.parse(o.end_at) > s);
}

export const OFF_STATUS = {
  pending: ["Menunggu", "#FFF1C2", "#5A4300"], approved: ["Disetujui", "#D9F2E1", "#144D2A"],
  rejected: ["Ditolak", "#FFDADA", "#6E1616"], cancelled: ["Dibatalkan", "#EEEBE4", "#4A463F"],
} as const;

/** "Rabu, 30 Sep 2026 · sehari penuh" / rentang tanggal / rentang jam. */
export const offLabel = (o: { start_at: string; end_at: string; all_day: boolean }) => {
  const last = new Date(Date.parse(o.end_at) - 1);
  const d0 = formatTanggal(o.start_at), d1 = formatTanggal(last);
  return o.all_day ? (d0 === d1 ? `${d0} · sehari penuh` : `${d0} – ${d1}`) : `${d0} · ${formatJam(o.start_at)}–${formatJam(o.end_at)}`;
};

