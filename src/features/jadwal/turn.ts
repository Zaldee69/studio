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
