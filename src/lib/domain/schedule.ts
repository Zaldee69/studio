// Jadwal: posisi grid & deteksi bentrok. Cermin booking_conflicts() di SQL (server tetap sumber kebenaran).
import { TZ } from "./format";

export interface ApptLike {
  id: string;
  resource_id: string;
  staff_id: string | null;
  start_at: string;
  end_at: string;
  status: string;
}

const hm = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });

/** Menit sejak 00:00 Asia/Jakarta. */
export function jktMinutes(d: Date | string): number {
  const [h, m] = hm.format(new Date(d)).split(":").map(Number);
  return (h % 24) * 60 + m;
}

/** "YYYY-MM-DD" + menit → ISO dengan offset +07:00. */
export function jktIso(date: string, minutes: number): string {
  const h = String(Math.floor(minutes / 60)).padStart(2, "0"), m = String(minutes % 60).padStart(2, "0");
  return `${date}T${h}:${m}:00+07:00`;
}

export const timeToMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const minToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Jam terdekat dibulatkan ke atas per 15 menit, dijepit ke jam buka. */
export function nextQuarter(nowMin: number, openMin: number, closeMin: number): number {
  return Math.min(Math.max(Math.ceil(nowMin / 15) * 15, openMin), closeMin - 15);
}

const overlaps = (a0: number, a1: number, b0: number, b1: number) => a0 < b1 && a1 > b0;
/** Booking yang tidak lagi memakai kursi/staf: dibatalkan atau pelanggan tidak datang. */
const freesSlot = (status: string) => status === "cancelled" || status === "no_show";

/** Booking lain yang tumpang tindih di resource ATAU staf yang sama (± jeda antar-booking, menit). Cermin booking_conflicts(). */
export function findConflicts<T extends ApptLike>(
  appts: T[],
  draft: { resourceId: string; staffId: string | null; start: string; end: string; excludeId?: string; bufferMin?: number },
): T[] {
  const buf = (draft.bufferMin ?? 0) * 60_000;
  const s = Date.parse(draft.start), e = Date.parse(draft.end);
  return appts.filter((a) => a.id !== draft.excludeId && !freesSlot(a.status)
    && (a.resource_id === draft.resourceId || (!!draft.staffId && a.staff_id === draft.staffId))
    && overlaps(Date.parse(a.start_at) - buf, Date.parse(a.end_at) + buf, s, e));
}

/** Id booking yang bentrok di resource yang sama (untuk badge "Bentrok" di grid). */
export function conflictingIds(appts: ApptLike[]): Set<string> {
  const out = new Set<string>();
  const live = appts.filter((a) => !freesSlot(a.status));
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.resource_id === b.resource_id
        && overlaps(Date.parse(a.start_at), Date.parse(a.end_at), Date.parse(b.start_at), Date.parse(b.end_at))) {
        out.add(a.id); out.add(b.id);
      }
    }
  }
  return out;
}

/** "YYYY-MM-DD" ± n hari (UTC murni, tanpa geser zona). */
export const addDays = (d: string, n: number) => new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

/** Rentang satu hari Asia/Jakarta untuk query. */
export const dayRange = (d: string) => [`${d}T00:00:00+07:00`, `${addDays(d, 1)}T00:00:00+07:00`] as const;
