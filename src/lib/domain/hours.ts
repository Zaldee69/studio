// Jam buka per hari, libur khusus, penanda Buka/Tutup, batas pembatalan. Cermin day_window() & cancel_my_booking() di SQL.
import { jktDate } from "./format";
import { jktMinutes, timeToMin, minToTime, addDays } from "./schedule";

export type DayHours = { weekday: number; open_time: string; close_time: string; closed: boolean };

/** 0 = Minggu … 6 = Sabtu untuk tanggal "YYYY-MM-DD" (kalender Jakarta). */
export const weekdayOf = (date: string) => new Date(`${date}T12:00:00+07:00`).getUTCDay();

export const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];

/** Jendela buka (menit) atau null bila libur mingguan / libur khusus. */
export function dayWindow(date: string, hours: DayHours[], closures: string[]): { open: number; close: number } | null {
  if (closures.includes(date)) return null;
  const h = hours.find((x) => x.weekday === weekdayOf(date));
  if (!h || h.closed) return null;
  return { open: timeToMin(h.open_time), close: timeToMin(h.close_time) };
}

/** "Sedang buka · sampai pukul 21.00" / "Sedang tutup · buka besok pukul 09.00" — dihitung pada jam Asia/Jakarta. */
export function openStatus(now: Date, hours: DayHours[], closures: string[]): { open: boolean; label: string } {
  const today = jktDate(now), m = jktMinutes(now);
  const w = dayWindow(today, hours, closures);
  const fmt = (x: number) => minToTime(x).replace(":", ".");
  if (w && m >= w.open && m < w.close) return { open: true, label: `Sedang buka · sampai pukul ${fmt(w.close)}` };
  if (w && m < w.open) return { open: false, label: `Sedang tutup · buka hari ini pukul ${fmt(w.open)}` };
  for (let i = 1; i <= 14; i++) {
    const d = addDays(today, i), n = dayWindow(d, hours, closures);
    if (n) return { open: false, label: `Sedang tutup · buka ${i === 1 ? "besok" : HARI[weekdayOf(d)]} pukul ${fmt(n.open)}` };
  }
  return { open: false, label: "Sedang tutup" };
}

/** Pembatalan / jadwal ulang pelanggan: hanya sampai cutoffHours sebelum mulai. */
export const canCancel = (startIso: string, cutoffHours: number, now: number) => Date.parse(startIso) - now >= cutoffHours * 3600_000;
