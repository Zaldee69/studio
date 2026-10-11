import { approvedOffFor } from "@/lib/domain/staff";
import { occupiedEnd } from "@/lib/domain/schedule";
import type { DayAppt, Master, TimeOffRow } from "../counter/types";

/** Staf yang relevan di konter: aktif & kategorinya punya kursi/bed aktif (mis. nail tanpa meja aktif tidak tampil). */
export const floorStaff = (master: Master) =>
  master.staff.filter((s) => s.active && master.resources.some((r) => r.type === s.category));

/** Keadaan satu staf saat ini: sedang melayani (atau sudah datang & menunggu), berikutnya, izin. */
export function staffNow(appts: DayAppt[], offs: TimeOffRow[], staffId: string, now = Date.now()) {
  const mine = appts.filter((a) => a.staff_id === staffId && a.status !== "cancelled" && a.status !== "no_show");
  const current = mine.find((a) => a.status === "in_service") ?? mine.find((a) => a.status === "arrived") ?? null;
  const next = mine.filter((a) => a !== current && (a.status === "booked" || a.status === "arrived" || a.status === "pending_review"))
    .sort((a, b) => a.start_at.localeCompare(b.start_at))[0] ?? null;
  const iso = new Date(now).toISOString();
  const off = !!approvedOffFor(offs, staffId, iso, iso);
  // kosong = tidak sedang melayani & tidak ada booking yang jamnya sedang berjalan
  const busy = !!current || mine.some((a) => a.status === "booked" && Date.parse(a.start_at) <= now && occupiedEnd(a) > now);
  return { current, next, off, free: !off && !busy };
}
