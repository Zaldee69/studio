// Laporan owner: pemilihan periode + pembanding. Angka dihitung di SQL (owner_report); di sini hanya tanggal & label.
import { previousPeriod } from "./kpi";
import { addDays } from "./schedule";

export type OwnerKind = "bulan" | "kuartal" | "tahun" | "kustom";
export type Range = { from: string; to: string; label: string };
/** sameCompare: pembanding "sebelumnya" = "tahun lalu" (laporan tahunan) → cukup satu kolom. */
export type OwnerPeriod = Range & { kind: OwnerKind; partial: boolean; value: string; previous: Range; lastYear: Range; sameCompare: boolean };

const ROMAN = ["I", "II", "III", "IV"];
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
const monthEnd = (y: number, m: number) => `${y}-${pad(m)}-${pad(lastDay(y, m))}`;
const monthName = (y: number, m: number, style: "long" | "short" = "long") =>
  new Intl.DateTimeFormat("id-ID", { month: style, year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
const shortDate = (d: string) =>
  new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
/** Geser tanggal N tahun; 29 Feb → 28 Feb bila tahun tujuan bukan kabisat. */
const shiftYear = (d: string, n: number) => {
  const y = +d.slice(0, 4) + n, m = +d.slice(5, 7);
  return `${y}-${pad(m)}-${pad(Math.min(+d.slice(8, 10), lastDay(y, m)))}`;
};
const rangeLabel = (from: string, to: string) => (from === to ? shortDate(from) : `${shortDate(from)} – ${shortDate(to)}`);

function full(kind: OwnerKind, value: string, dari: string, sampai: string, today: string): { kind: OwnerKind; value: string; cur: Range; prev: Range } {
  if (kind === "kuartal" && /^\d{4}-Q[1-4]$/.test(value)) {
    const y = +value.slice(0, 4), q = +value.slice(6);
    const py = q === 1 ? y - 1 : y, pq = q === 1 ? 4 : q - 1;
    return { kind, value,
      cur: { from: `${y}-${pad(q * 3 - 2)}-01`, to: monthEnd(y, q * 3), label: `Kuartal ${ROMAN[q - 1]} ${y}` },
      prev: { from: `${py}-${pad(pq * 3 - 2)}-01`, to: monthEnd(py, pq * 3), label: `Kuartal ${ROMAN[pq - 1]} ${py}` } };
  }
  if (kind === "tahun" && /^\d{4}$/.test(value)) {
    const y = +value;
    return { kind, value, cur: { from: `${y}-01-01`, to: `${y}-12-31`, label: `Tahun ${y}` }, prev: { from: `${y - 1}-01-01`, to: `${y - 1}-12-31`, label: `Tahun ${y - 1}` } };
  }
  if (kind === "kustom" && /^\d{4}-\d{2}-\d{2}$/.test(dari) && /^\d{4}-\d{2}-\d{2}$/.test(sampai)) {
    const [from, to] = dari <= sampai ? [dari, sampai] : [sampai, dari];
    const p = previousPeriod(from, to);
    return { kind, value: "", cur: { from, to, label: rangeLabel(from, to) }, prev: { ...p, label: rangeLabel(p.from, p.to) } };
  }
  // default: bulan (nilai YYYY-MM, atau bulan berjalan)
  const v = /^\d{4}-\d{2}$/.test(value) ? value : today.slice(0, 7);
  const y = +v.slice(0, 4), m = +v.slice(5, 7);
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return { kind: "bulan", value: v,
    cur: { from: `${v}-01`, to: monthEnd(y, m), label: monthName(y, m) },
    prev: { from: `${py}-${pad(pm)}-01`, to: monthEnd(py, pm), label: monthName(py, pm) } };
}

/**
 * Periode laporan owner. Periode yang masih berjalan dipotong sampai hari ini, dan pembandingnya dipotong sepanjang
 * hari yang sama (mis. 1–15 Sep vs 1–15 Agu) supaya perbandingan adil (utilisasi tidak ikut menghitung hari mendatang).
 */
export function ownerPeriod(q: { periode?: string; nilai?: string; dari?: string; sampai?: string }, today: string): OwnerPeriod {
  const kind = (["bulan", "kuartal", "tahun", "kustom"] as const).find((k) => k === q.periode) ?? "bulan";
  const f = full(kind, q.nilai ?? "", q.dari ?? "", q.sampai ?? "", today);
  let { cur, prev } = f;
  let ly: Range = { from: shiftYear(cur.from, -1), to: shiftYear(cur.to, -1), label: "" };
  const partial = cur.to > today && cur.from <= today;
  if (partial) {
    const len = Math.round((Date.parse(today) - Date.parse(cur.from)) / 864e5);
    const cut = (r: Range) => ({ ...r, to: [r.to, addDays(r.from, len)].sort()[0] });
    cur = { ...cur, to: today, label: `${cur.label} (s.d. ${shortDate(today)})` };
    prev = cut(prev); ly = cut(ly);
    prev.label = rangeLabel(prev.from, prev.to);
  }
  ly.label = f.kind === "bulan" && !partial ? monthName(+ly.from.slice(0, 4), +ly.from.slice(5, 7))
    : f.kind === "kuartal" && !partial ? `${cur.label.replace(/\d{4}$/, "")}${+ly.from.slice(0, 4)}`
    : f.kind === "tahun" && !partial ? `Tahun ${ly.from.slice(0, 4)}` : rangeLabel(ly.from, ly.to);
  return { kind: f.kind, value: f.value, from: cur.from, to: cur.to, label: cur.label, partial, previous: prev, lastYear: ly,
    sameCompare: prev.from === ly.from && prev.to === ly.to };
}

/** Capaian target (%), null bila target belum diisi. */
export const attainment = (actual: number | null | undefined, target: number | null | undefined) =>
  actual == null || !target ? null : (actual * 100) / target;

/** Margin kotor % dari omzet bersih. */
export const marginPct = (net: number, hpp: number) => (net > 0 ? ((net - hpp) * 100) / net : null);
