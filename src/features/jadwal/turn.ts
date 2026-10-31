import type { DayAppt } from "../counter/types";

/**
 * Giliran walk-in per kategori: di antara staf yang kosong, yang paling sedikit melayani walk-in hari ini;
 * seri → yang paling lama menganggur (layanan terakhirnya selesai paling awal, belum melayani = paling depan).
 */
export function walkInTurn(staff: { id: string; category: string; free: boolean }[], appts: DayAppt[]): Record<string, string> {
  const live = appts.filter((a) => a.status !== "cancelled" && a.status !== "no_show");
  const score = (id: string) => ({
    walkIns: live.filter((a) => a.staff_id === id && a.source === "walk_in").length,
    lastEnd: Math.max(-Infinity, ...live.filter((a) => a.staff_id === id).map((a) => Date.parse(a.service_ended_at ?? a.end_at))),
  });
  const turn: Record<string, string> = {};
  const ranked = staff.filter((s) => s.free).map((s) => ({ ...s, ...score(s.id) }))
    .sort((a, b) => a.walkIns - b.walkIns || a.lastEnd - b.lastEnd);
  for (const s of ranked) turn[s.category] ??= s.id;
  return turn;
}

/**
 * Jam mulai antre walk-in: celah kosong pertama (≥ durasi) setelah sekarang di jadwal staf itu — sesudah yang sedang
 * dilayani, yang sudah antre, dan booking yang terjadwal. Antrean tidak pernah menimpa booking (keputusan owner 1 Nov).
 */
export function queueStart(appts: DayAppt[], staffId: string, now: number, durMin: number): number {
  const live = ["booked", "pending_review", "arrived", "in_service"];
  const blocks = appts.filter((a) => a.staff_id === staffId && live.includes(a.status))
    .map((a) => ({ start: Date.parse(a.start_at), end: Date.parse(a.end_at) }))
    .sort((x, y) => x.start - y.start);
  let t = now;
  for (const b of blocks) if (b.end > t && b.start < t + durMin * 60_000) t = b.end;
  return t;
}
