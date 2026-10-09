// KPI & SOP. Cermin fungsi SQL Tahap 5 (kpi_period, kpi_aov_drivers, appt_minutes, kpi_heatmap, kpi_duration_variance,
// kpi_customers, kpi_online, kpi_insights, sop_status, maintenance_state) — ubah keduanya bersamaan (satu definisi per KPI).
import type { Category } from "./cart";

type ServiceCat = Exclude<Category, "retail">;
export type TxItem = { category: Category; netAmount: number; fromUpsell?: boolean };
export type Tx = { items: TxItem[]; voided?: boolean; bundle?: boolean };

const live = (txs: Tx[]) => txs.filter((t) => !t.voided);

/** AOV kategori = Σ net layanan kategori ÷ transaksi yang memuat ≥1 layanan kategori itu. Tanpa transaksi → null. */
export function aov(txs: Tx[], category: ServiceCat): number | null {
  let sum = 0, count = 0;
  for (const t of live(txs)) {
    const items = t.items.filter((i) => i.category === category);
    if (!items.length) continue;
    count++;
    sum += items.reduce((a, i) => a + i.netAmount, 0);
  }
  return count ? Math.round(sum / count) : null;
}

/** Omzet = Σ total transaksi non-void (= Σ net semua item, diskon sudah teralokasi ke item). */
export const omzet = (txs: Tx[]) => live(txs).reduce((a, t) => a + t.items.reduce((b, i) => b + i.netAmount, 0), 0);
export function aovAll(txs: Tx[]): number | null {
  const n = live(txs).length;
  return n ? Math.round(omzet(txs) / n) : null;
}

/** Rasio ritel (%) = pendapatan ritel ÷ pendapatan jasa bersih × 100. Jasa 0 → null ("—"). */
export function retailRatio(txs: Tx[]): number | null {
  let retail = 0, service = 0;
  for (const t of live(txs)) for (const i of t.items) {
    if (i.category === "retail") retail += i.netAmount;
    else service += i.netAmount;
  }
  return service ? (retail / service) * 100 : null;
}

export type BandStatus = "below" | "within" | "above";
export const BAND_LABEL: Record<BandStatus, string> = { below: "Di bawah target", within: "Sesuai target", above: "Di atas target" };
export function bandStatus(v: number | null, min: number, max: number): BandStatus | null {
  if (v === null) return null;
  return v < min ? "below" : v > max ? "above" : "within";
}
/** Status nilai vs target minimal (AOV, utilisasi). */
export const targetStatus = (v: number | null, target: number): "below" | "within" | null => (v === null ? null : v < target ? "below" : "within");

/** Penggerak AOV atas transaksi berlayanan (kategori tertentu bila diberikan). */
export function aovDrivers(txs: Tx[], category?: ServiceCat) {
  const isCat = (i: TxItem) => (category ? i.category === category : i.category !== "retail");
  const rows = live(txs).map((t) => ({ items: t.items.filter(isCat), bundle: !!t.bundle })).filter((t) => t.items.length);
  const n = rows.length;
  return {
    txCount: n,
    avgServices: n ? rows.reduce((a, t) => a + t.items.length, 0) / n : null,
    upsellRate: n ? (rows.filter((t) => t.items.some((i) => i.fromUpsell)).length * 100) / n : null,
    bundlePct: n ? (rows.filter((t) => t.bundle).length * 100) / n : null,
  };
}

export type ApptMin = { status: string; durationMin: number; startedAt?: string | null; endedAt?: string | null };
const SOLD = new Set(["in_service", "completed", "paid"]);
/**
 * Menit terjual satu appointment: nyata (selesai − mulai) bila ada; in_service berjalan → sampai `now`, dibatasi jam tutup;
 * selain itu durasi rencana.
 */
export function apptMinutes(a: ApptMin, now: Date = new Date(), closeAt?: Date): number {
  if (a.startedAt && a.endedAt) return (Date.parse(a.endedAt) - Date.parse(a.startedAt)) / 60000;
  if (a.status === "in_service" && a.startedAt) {
    const end = Math.min(now.getTime(), closeAt?.getTime() ?? Infinity);
    return Math.max(0, (end - Date.parse(a.startedAt)) / 60000);
  }
  return a.durationMin;
}

/** Utilisasi (%) = menit terjual (in_service|completed|paid) ÷ menit tersedia × 100. `planned`: pakai durasi rencana. */
export function utilization(appts: ApptMin[], availableMin: number, opts: { mode?: "actual" | "planned"; now?: Date; closeAt?: Date } = {}): number {
  if (availableMin <= 0) return 0;
  const sold = appts.filter((a) => SOLD.has(a.status))
    .reduce((s, a) => s + (opts.mode === "planned" ? a.durationMin : apptMinutes(a, opts.now, opts.closeAt)), 0);
  return (sold / availableMin) * 100;
}

/** Menit tersedia = Σ menit buka per hari (hari tutup/libur = 0). */
export const openMinutes = (days: { closed: boolean; openMin: number; closeMin: number }[]) =>
  days.reduce((a, d) => a + (d.closed ? 0 : d.closeMin - d.openMin), 0);

const JKT_MS = 7 * 3600_000;
/** Pecah interval layanan per jam (Asia/Jakarta). weekday ISO 1=Sen..7=Min. */
export function splitByHour(start: string | Date, end: string | Date): { weekday: number; hour: number; minutes: number }[] {
  const s = new Date(start).getTime(), e = new Date(end).getTime();
  const out: { weekday: number; hour: number; minutes: number }[] = [];
  for (let h = Math.floor((s + JKT_MS) / 3600_000) * 3600_000 - JKT_MS; h < e; h += 3600_000) {
    const mins = (Math.min(e, h + 3600_000) - Math.max(s, h)) / 60000;
    const local = new Date(h + JKT_MS);
    if (mins > 0) out.push({ weekday: ((local.getUTCDay() + 6) % 7) + 1, hour: local.getUTCHours(), minutes: mins });
  }
  return out;
}
/** Peta panas: Σ menit per (hari-minggu, jam) ÷ jumlah tanggal hari-minggu itu dalam periode [from, to] (YYYY-MM-DD). */
export function heatmap(intervals: { start: string | Date; end: string | Date }[], from: string, to: string) {
  const weeks = new Map<number, number>();
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 86_400_000) {
    const wd = ((new Date(d).getUTCDay() + 6) % 7) + 1;
    weeks.set(wd, (weeks.get(wd) ?? 0) + 1);
  }
  const cells = new Map<string, number>();
  for (const iv of intervals) for (const p of splitByHour(iv.start, iv.end)) cells.set(`${p.weekday}-${p.hour}`, (cells.get(`${p.weekday}-${p.hour}`) ?? 0) + p.minutes);
  return (weekday: number, hour: number) => (cells.get(`${weekday}-${hour}`) ?? 0) / (weeks.get(weekday) ?? 1);
}

/** Selisih durasi per layanan: rata-rata (nyata − rencana), hanya bila n ≥ minN. */
export function durationVariance(rows: { service: string; planned: number; actual: number }[], minN = 5) {
  const by = new Map<string, { sum: number; n: number }>();
  for (const r of rows) { const x = by.get(r.service) ?? { sum: 0, n: 0 }; x.sum += r.actual - r.planned; x.n++; by.set(r.service, x); }
  return [...by].filter(([, x]) => x.n >= minN).map(([service, x]) => ({ service, diffAvg: x.sum / x.n, n: x.n }))
    .sort((a, b) => Math.abs(b.diffAvg) - Math.abs(a.diffAvg));
}

const dnum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86_400_000;
/**
 * Tingkat kembali (%): dari pelanggan yang bertransaksi pada hari d dalam periode dengan pengamatan ≥ window hari
 * (d ≤ today − window), berapa yang bertransaksi lagi ≤ window hari sesudahnya. Walk-in (customerId null) dikecualikan.
 */
export function returnWindowRate(visits: { customerId: string | null; date: string }[], from: string, to: string, today: string, windowDays = 60) {
  const by = new Map<string, number[]>();
  for (const v of visits) if (v.customerId) by.set(v.customerId, [...(by.get(v.customerId) ?? []), dnum(v.date)]);
  let eligible = 0, back = 0;
  for (const [, ds] of by) {
    const inP = ds.filter((d) => d >= dnum(from) && d <= dnum(to) && d <= dnum(today) - windowDays);
    if (!inP.length) continue;
    eligible++;
    if (inP.some((d) => ds.some((e) => e > d && e - d <= windowDays))) back++;
  }
  return { eligible, back, rate: eligible ? (back * 100) / eligible : null };
}

/** Efektivitas follow-up (%): pelanggan yang dikirimi & bertransaksi ≤ window hari sesudahnya ÷ pelanggan yang dikirimi. */
export function followupRate(sent: { customerId: string; at: string }[], txs: { customerId: string; at: string }[], windowDays = 30) {
  const customers = new Set(sent.map((s) => s.customerId));
  const ok = new Set(sent.filter((s) => txs.some((t) => t.customerId === s.customerId && Date.parse(t.at) > Date.parse(s.at)
    && Date.parse(t.at) <= Date.parse(s.at) + windowDays * 86_400_000)).map((s) => s.customerId));
  return { sent: customers.size, converted: ok.size, rate: customers.size ? (ok.size * 100) / customers.size : null };
}

/** Funnel sesi unik: konversi antar langkah (%). */
export function funnel(steps: number[]) {
  return steps.map((n, i) => ({ n, pct: i === 0 ? null : steps[i - 1] ? (n * 100) / steps[i - 1] : null }));
}
export const noShowRate = (noShow: number, showed: number) => (noShow + showed ? (noShow * 100) / (noShow + showed) : null);

/** Perbandingan periode: delta % vs periode sebelumnya; lalu 0/null → null ("baru"). */
export const delta = (cur: number | null, prev: number | null) => (prev ? (((cur ?? 0) - prev) * 100) / prev : null);
/** Periode sebelumnya: panjang sama, tepat sebelum `from`. */
export function previousPeriod(from: string, to: string) {
  const len = dnum(to) - dnum(from) + 1;
  const iso = (n: number) => new Date(n * 86_400_000).toISOString().slice(0, 10);
  return { from: iso(dnum(from) - len), to: iso(dnum(from) - 1) };
}

/** Persen 1 desimal gaya Indonesia (22,7). */
export const pct1 = (v: number) => (Math.round(v * 10) / 10).toLocaleString("id-ID", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const deltaLabel = (d: number | null) => (d === null ? "baru" : `${d >= 0 ? "▲" : "▼"} ${pct1(Math.abs(d))}%`);

const DAYS = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
export type InsightInput = {
  aov: Partial<Record<ServiceCat, number | null>>; targets: Record<"barbershop" | "nail", number>; aovGapPct: number;
  upsellRate: Partial<Record<ServiceCat, number | null>>; upsellName: Partial<Record<ServiceCat, string | null>>;
  utilization: { name: string; pct: number | null }[]; lowUtilPct: number; busiest: { weekday: number; hour: number } | null;
  retailRatio: number | null; retailMin: number; retailMax: number; noShowRate: number | null;
  overruns: { name: string; diffAvg: number }[];
};
/** 4.11 Insight berbasis aturan: maks 3, urut prioritas (sama dengan kpi_insights SQL). */
export function insights(i: InsightInput): { code: string; message: string; href: string }[] {
  const out: { p: number; code: string; message: string; href: string }[] = [];
  for (const cat of ["barbershop", "nail"] as const) {
    const v = i.aov[cat], t = i.targets[cat];
    if (v == null || !t || ((t - v) * 100) / t <= i.aovGapPct) continue;
    const label = cat === "barbershop" ? "Barbershop" : "Nail";
    out.push({ p: 1, code: `aov_${cat}`, href: "#aov",
      message: `AOV ${label} ${pct1(((t - v) * 100) / t)}% di bawah target. Tingkat upsell ${label} ${pct1(i.upsellRate[cat] ?? 0)}% — tawarkan ${i.upsellName[cat] ?? "layanan tambahan"}.` });
  }
  const low = i.utilization.filter((u) => u.pct !== null && u.pct < i.lowUtilPct)
    .sort((a, b) => a.pct! - b.pct! || a.name.localeCompare(b.name))[0];
  if (low && i.busiest) out.push({ p: 2, code: "low_util", href: "#utilisasi",
    message: `${low.name} terpakai ${pct1(low.pct!)}% — jam paling ramai: ${DAYS[i.busiest.weekday]} ${String(i.busiest.hour).padStart(2, "0")}:00. Pertimbangkan jadwal staf / promo jam sepi.` });
  if (i.retailRatio !== null && (i.retailRatio < i.retailMin || i.retailRatio > i.retailMax)) out.push({ p: 3, code: "retail_ratio", href: "#ritel",
    message: `Rasio ritel ${pct1(i.retailRatio)}%, ${i.retailRatio < i.retailMin ? "di bawah" : "di atas"} target ${i.retailMin}–${i.retailMax}%.` });
  if (i.noShowRate !== null && i.noShowRate > 10) out.push({ p: 4, code: "no_show", href: "#online", message: `No-show ${pct1(i.noShowRate)}% — aktifkan pengingat H-1.` });
  const over = i.overruns.filter((o) => o.diffAvg > 10).sort((a, b) => b.diffAvg - a.diffAvg)[0];
  if (over) out.push({ p: 5, code: "overrun", href: "#durasi", message: `${over.name} rata-rata molor ${Math.round(over.diffAvg)} menit — perbarui durasi di Pengaturan.` });
  return out.sort((a, b) => a.p - b.p || a.code.localeCompare(b.code)).slice(0, 3).map(({ code, message, href }) => ({ code, message, href }));
}

// ---------- SOP & perawatan ----------
export type SopStatus = "ok" | "done" | "part" | "empty" | "closed";
export const SOP_STATUS: Record<SopStatus, { label: string; bg: string; fg: string; icon: string }> = {
  ok: { label: "Diotorisasi", bg: "#D9F2E1", fg: "#144D2A", icon: "✓" },
  done: { label: "Lengkap, belum diotorisasi", bg: "#FFF1C2", fg: "#5A4300", icon: "●" },
  part: { label: "Belum lengkap", bg: "#FFDADA", fg: "#6E1616", icon: "!" },
  empty: { label: "Kosong", bg: "#EEEBE4", fg: "#4A463F", icon: "○" },
  closed: { label: "Tutup", bg: "#F6F4EF", fg: "#6B665C", icon: "—" },
};
export function sopStatus(done: number, total: number, approved: boolean, closed: boolean): SopStatus {
  if (approved) return "ok";
  if (closed && done === 0) return "closed";
  if (total > 0 && done >= total) return "done";
  return done > 0 ? "part" : "empty";
}
export const STAGES = ["wash", "soak", "autoclave"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { wash: "Cuci", soak: "Rendam", autoclave: "Autoclave" };
/** Tahap boleh dicentang hanya bila tahap sebelumnya aktif; dibatalkan hanya bila tahap sesudahnya tidak aktif. */
export function canRecord(done: Partial<Record<Stage, unknown>>, stage: Stage) {
  const i = STAGES.indexOf(stage);
  return !done[stage] && (i === 0 || !!done[STAGES[i - 1]]);
}
export function canUndo(done: Partial<Record<Stage, unknown>>, stage: Stage) {
  const i = STAGES.indexOf(stage);
  return !!done[stage] && (i === STAGES.length - 1 || !done[STAGES[i + 1]]);
}

export type MaintState = "overdue" | "due" | "soon" | "ok";
export const maintenanceState = (daysLeft: number): MaintState => (daysLeft < 0 ? "overdue" : daysLeft === 0 ? "due" : daysLeft <= 3 ? "soon" : "ok");
export const MAINT_STATUS: Record<MaintState, { bg: string; fg: string; icon: string }> = {
  overdue: { bg: "#FFDADA", fg: "#6E1616", icon: "!" },
  due: { bg: "#FFE2CC", fg: "#6B3000", icon: "●" },
  soon: { bg: "#FFF1C2", fg: "#5A4300", icon: "◔" },
  ok: { bg: "#D9F2E1", fg: "#144D2A", icon: "✓" },
};
export const maintenanceLabel = (daysLeft: number) =>
  daysLeft < 0 ? `Terlambat ${-daysLeft} hari` : daysLeft === 0 ? "Jatuh tempo hari ini" : `${daysLeft} hari lagi`;
/** next_due = tanggal terakhir selesai (atau dibuat) + interval; days_left = next_due − hari ini. */
export function nextDue(lastDone: string | null, created: string, intervalDays: number, today: string) {
  const due = dnum(lastDone ?? created) + intervalDays;
  return { nextDue: new Date(due * 86_400_000).toISOString().slice(0, 10), daysLeft: due - dnum(today) };
}
