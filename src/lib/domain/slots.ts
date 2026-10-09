// Slot booking online. Cermin plan_booking() & get_available_slots() di SQL (sumber kebenaran saat menyimpan).
// Semua waktu = menit sejak 00:00 Asia/Jakarta pada tanggal yang dipilih.

import type { Cat } from "./category";
export interface SlotService { id: string; category: Cat | "retail"; durationMin: number; needsPedicure: boolean }
export interface SlotResource { id: string; type: Cat; isPedicure: boolean }
export interface SlotStaff { id: string; category: Cat; homeResourceId?: string | null } // kursi/meja utama (diutamakan)
export interface Busy { resourceId: string; staffId: string | null; startMin: number; endMin: number }
export interface PlanGroup { category: Cat; serviceIds: string[]; resourceId: string; staffId: string; startMin: number; durationMin: number }

interface Ctx {
  services: SlotService[];      // layanan terpilih
  resources: SlotResource[];    // aktif, sudah terurut (sort, name)
  staff: SlotStaff[];           // aktif, sudah terurut (sort, name)
  busy: Busy[];                 // appointment non-cancelled di tanggal itu
  staffPick?: Partial<Record<Cat, string>>;
  together: boolean;
  buffer?: number;              // booking_buffer_minutes: jeda sebelum & sesudah booking lain
  offs?: { staffId: string; startMin: number; endMin: number }[]; // izin disetujui
}

function groups(services: SlotService[]) {
  return (["barbershop", "nail"] as const)
    .map((cat) => {
      const s = services.filter((x) => x.category === cat);
      return { cat, ids: s.map((x) => x.id), dur: s.reduce((a, x) => a + x.durationMin, 0), pedi: s.some((x) => x.needsPedicure) };
    })
    .filter((g) => g.ids.length);
}

const overlaps = (b: Busy, a0: number, b0: number, buf = 0) => b.startMin - buf < b0 && b.endMin + buf > a0;

export function planBooking(ctx: Ctx, startMin: number): PlanGroup[] | null {
  const out: PlanGroup[] = [];
  let t = startMin;
  for (const g of groups(ctx.services)) {
    const a0 = t, b0 = t + g.dur;
    const buf = ctx.buffer ?? 0;
    // staf dulu, lalu kursinya: pedicure yang sesuai > kursi utama staf itu > urutan asli (sort stabil)
    const pick = ctx.staffPick?.[g.cat];
    const stf = ctx.staff.find((s) => s.category === g.cat && (!pick || s.id === pick)
      && !ctx.busy.some((b) => b.staffId === s.id && overlaps(b, a0, b0, buf))
      && !(ctx.offs ?? []).some((o) => o.staffId === s.id && o.startMin < b0 && o.endMin > a0));
    if (!stf) return null;
    const rank = (r: SlotResource) => Number(r.isPedicure === g.pedi) * 2 + Number(r.id === stf.homeResourceId);
    const pool = ctx.resources.filter((r) => r.type === g.cat).sort((x, y) => rank(y) - rank(x));
    const res = pool.find((r) => !ctx.busy.some((b) => b.resourceId === r.id && overlaps(b, a0, b0, buf)));
    if (!res) return null;
    out.push({ category: g.cat, serviceIds: g.ids, resourceId: res.id, staffId: stf.id, startMin: a0, durationMin: g.dur });
    if (!ctx.together) t = b0;
  }
  return out.length ? out : null;
}

/** Slot tiap 30 menit dalam jam buka; untuk hari ini minStartMin = sekarang + 30. */
export function availableSlots(ctx: Ctx, openMin: number, closeMin: number, minStartMin = openMin): number[] {
  const gs = groups(ctx.services);
  if (!gs.length) return [];
  const total = ctx.together ? Math.max(...gs.map((g) => g.dur)) : gs.reduce((a, g) => a + g.dur, 0);
  const out: number[] = [];
  for (let t = openMin; t + total <= closeMin; t += 30) {
    if (t >= Math.max(openMin, minStartMin) && planBooking(ctx, t)) out.push(t);
  }
  return out;
}

export const minToHHMM = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Slot satu tanggal: jendela buka hari itu (null = libur) + lead time (menit dari sekarang, hanya hari ini). */
export function slotsForDay(ctx: Ctx, window: { open: number; close: number } | null, opts: { isToday: boolean; nowMin: number; leadMin: number }) {
  if (!window) return [];
  return availableSlots(ctx, window.open, window.close, opts.isToday ? opts.nowMin + opts.leadMin : window.open);
}
