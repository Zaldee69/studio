"use client";

import { useState } from "react";
import { CAT_LABEL, COLOR, rb } from "./palette";

// Grafik SVG sederhana mengikuti P5: satu sumbu y, garis 2 px, warna per entitas, legenda + label langsung,
// tooltip saat hover/tap, dan setiap grafik punya "Lihat tabel". ponytail: tanpa pustaka grafik — cukup untuk 6 jenis ini.

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold" aria-label="Legenda">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <svg width="18" height="10" aria-hidden="true"><line x1="0" y1="5" x2="18" y2="5" stroke={i.color} strokeWidth="2" strokeDasharray={i.dashed ? "4 3" : undefined} /></svg>{i.label}
        </li>
      ))}
    </ul>
  );
}

export function DataTable({ head, rows, caption }: { head: string[]; rows: (string | number)[][]; caption: string }) {
  return (
    <details className="text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-accent">Lihat tabel</summary>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] tabular">
          <caption className="sr-only">{caption}</caption>
          <thead><tr className="text-left text-xs text-muted">{head.map((h, i) => <th key={h} className={`py-1.5 pr-2 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-[#EEEEEA]">{r.map((c, j) => <td key={j} className={`py-1.5 pr-2 ${j ? "text-right" : ""}`}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </details>
  );
}

type Series = { key: string; label: string; color: string; values: (number | null)[] };
/** Garis harian + garis target putus-putus berlabel; crosshair + tooltip. */
export function LineChart({ labels, series, targets, tooltip, ariaLabel }: {
  labels: string[]; series: Series[]; targets: { label: string; value: number; color: string }[];
  tooltip?: (i: number) => React.ReactNode; ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 720, H = 240, L = 48, R = 16, T = 12, B = 28;
  const all = [...series.flatMap((s) => s.values.filter((v): v is number => v !== null)), ...targets.map((t) => t.value)];
  const max = Math.max(1, ...all) * 1.1;
  const n = labels.length;
  const x = (i: number) => L + (n <= 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (n - 1));
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max / 1.1);
  const every = Math.ceil(n / 8);
  const path = (vals: (number | null)[]) => vals.reduce((d, v, i) => (v === null ? d : `${d}${d && vals[i - 1] !== null && i > 0 ? "L" : "M"}${x(i)},${y(v)}`), "");
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={ariaLabel} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="#EFEFEB" /><text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#63665F">{rb(t)}</text></g>
        ))}
        {labels.map((l, i) => ((i % every === 0 && n - 1 - i >= every / 2) || i === n - 1) && <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#63665F">{l}</text>)}
        {targets.map((t) => (
          <g key={t.label}>
            <line x1={L} x2={W - R} y1={y(t.value)} y2={y(t.value)} stroke={t.color} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.8" />
            <text x={W - R} y={y(t.value) - 5} textAnchor="end" fontSize="11" fontWeight="600" fill="#1F2320" stroke="#fff" strokeWidth="3" paintOrder="stroke">{t.label}</text>
          </g>
        ))}
        {series.map((s) => <path key={s.key} d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" />)}
        {n <= 10 && series.map((s) => s.values.map((v, i) => v !== null && <circle key={`${s.key}${i}`} cx={x(i)} cy={y(v)} r="3.5" fill="#fff" stroke={s.color} strokeWidth="2" />))}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="#1F2320" strokeWidth="1" opacity="0.4" />}
        {labels.map((_, i) => (
          <rect key={i} x={x(i) - (W - L - R) / Math.max(1, n - 1) / 2} y={T} width={Math.max(8, (W - L - R) / Math.max(1, n - 1))} height={H - T - B}
            fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && tooltip && (
        <div role="status" className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-[10px] border border-line bg-card px-3 py-2 text-xs shadow-[0_8px_24px_rgba(28,27,25,0.18)] tabular"
          style={{ left: `min(calc(${(x(hover) / W) * 100}% + 8px), calc(100% - 190px))` }}>{tooltip(hover)}</div>
      )}
    </div>
  );
}

/** Bar horizontal (utilisasi) + garis target. */
export function HBars({ rows, target, max = 100, ariaLabel }: {
  rows: { label: string; value: number; color: string; caption: string }[]; target?: { value: number; label: string }; max?: number; ariaLabel: string;
}) {
  const m = Math.max(max, target?.value ?? 0, ...rows.map((r) => r.value));
  return (
    <div role="img" aria-label={ariaLabel} className="relative flex flex-col gap-2">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[120px_1fr] items-center gap-2 text-sm min-[820px]:grid-cols-[150px_1fr_190px] print:grid-cols-[130px_1fr_170px]" title={`${r.label}: ${r.caption}`}>
          <span className="truncate font-semibold">{r.label}</span>
          <span className="relative h-6 rounded-md bg-paper">
            <span className="absolute inset-y-0 left-0 rounded-md" style={{ width: `${Math.min(100, (r.value / m) * 100)}%`, background: r.color }} />
            {target && <span aria-hidden="true" className="absolute inset-y-[-3px] w-0.5 bg-ink" style={{ left: `${(target.value / m) * 100}%` }} />}
          </span>
          <span className="col-span-2 text-xs text-muted tabular min-[820px]:col-span-1 min-[820px]:text-right print:col-span-1 print:text-right">{r.caption}</span>
        </div>
      ))}
      {target && <span className="text-xs text-muted"><span aria-hidden="true" className="mr-1 inline-block h-3 w-0.5 bg-ink align-middle" />{target.label}</span>}
    </div>
  );
}

const DAY = ["", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAY_LONG = ["", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
/** Peta panas satu warna (terang → gelap). Tutup = abu bertanda. */
export function Heatmap({ cells }: { cells: { weekday: number; hour: number; minutes_avg: number; closed: boolean }[] }) {
  const hours = [...new Set(cells.map((c) => c.hour))].sort((a, b) => a - b);
  const max = Math.max(1, ...cells.filter((c) => !c.closed).map((c) => c.minutes_avg));
  const at = (d: number, h: number) => cells.find((c) => c.weekday === d && c.hour === h);
  const shade = (v: number) => { const t = v / max; return `rgb(${Math.round(246 - t * (246 - 58))},${Math.round(244 - t * (244 - 47))},${Math.round(252 - t * (252 - 143))})`; };
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[3px] text-[11px] tabular" aria-label="Peta panas kesibukan: rata-rata menit terjual per jam">
          <thead><tr><th className="sr-only">Hari</th>{hours.map((h) => <th key={h} scope="col" className="w-10 font-semibold text-muted">{String(h).padStart(2, "0")}</th>)}</tr></thead>
          <tbody>
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <tr key={d}>
                <th scope="row" className="pr-1 text-left font-semibold text-muted">{DAY[d]}</th>
                {hours.map((h) => {
                  const c = at(d, h);
                  const closed = !c || c.closed;
                  const v = c?.minutes_avg ?? 0;
                  const label = closed ? `${DAY_LONG[d]} ${String(h).padStart(2, "0")}:00 · Tutup` : `${DAY_LONG[d]} ${String(h).padStart(2, "0")}:00 · rata-rata ${Math.round(v)} menit terjual`;
                  return (
                    <td key={h} title={label} aria-label={label} className="h-8 w-10 rounded-[5px] text-center"
                      style={closed ? { background: "repeating-linear-gradient(45deg,#EFEFEB,#EFEFEB 4px,#E5E5E0 4px,#E5E5E0 8px)", color: "#63665F" }
                        : { background: shade(v), color: v / max > 0.55 ? "#fff" : "#1F2320" }}>
                      {closed ? "" : v >= 1 ? Math.round(v) : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2 text-xs text-muted" aria-hidden="true">
        <span>0</span><span className="h-3 w-40 rounded" style={{ background: `linear-gradient(90deg, ${shade(0)}, ${shade(max)})` }} /><span>{Math.round(max)} menit</span>
        <span className="ml-3 inline-block h-3 w-5 rounded" style={{ background: "repeating-linear-gradient(45deg,#EFEFEB,#EFEFEB 4px,#E5E5E0 4px,#E5E5E0 8px)" }} /><span>Tutup</span>
      </div>
    </div>
  );
}

/** Bullet chart rasio ritel: skala 0–30%+, pita target diarsir, penanda nilai. */
export function Bullet({ value, min, max, scale = 30 }: { value: number | null; min: number; max: number; scale?: number }) {
  const pos = (v: number) => `${Math.min(100, (v / scale) * 100)}%`;
  return (
    <div className="flex flex-col gap-1" role="img" aria-label={`Rasio ritel ${value === null ? "—" : value.toFixed(1)}%, pita target ${min}–${max}%`}>
      <div className="relative h-8 rounded-md bg-paper">
        <div className="absolute inset-y-0 rounded" style={{ left: pos(min), width: `calc(${pos(max)} - ${pos(min)})`, background: "repeating-linear-gradient(45deg,#E6F1E4,#E6F1E4 5px,#C4E8D0 5px,#C4E8D0 10px)" }} />
        {value !== null && <div className="absolute inset-y-1.5 left-0 rounded-sm" style={{ width: pos(value), background: COLOR.retail }} />}
        {value !== null && <div aria-hidden="true" className="absolute -inset-y-1 w-1 rounded bg-ink" style={{ left: `calc(${pos(value)} - 2px)` }} />}
      </div>
      <div className="relative h-4 text-[11px] text-muted tabular">
        {[0, 10, 20, 30].map((t) => <span key={t} className="absolute -translate-x-1/2" style={{ left: pos(t) }}>{t}%{t === 30 ? "+" : ""}</span>)}
      </div>
    </div>
  );
}

/** Bar bertumpuk per minggu, celah 2 px antar segmen, label total. */
export function StackedWeekly({ weeks }: { weeks: { week: string; barbershop: number; nail: number; massage?: number; retail: number }[] }) {
  const keys = ["barbershop", "nail", "massage", "retail"] as const;
  const sum = (w: (typeof weeks)[number]) => keys.reduce((a, k) => a + (w[k] ?? 0), 0);
  const max = Math.max(1, ...weeks.map(sum));
  return (
    <div className="flex flex-col gap-2">
      <Legend items={keys.map((k) => ({ label: CAT_LABEL[k], color: COLOR[k] }))} />
      <div className="flex h-44 items-end gap-2 overflow-x-auto" role="img" aria-label="Tren omzet mingguan per kategori">
        {weeks.map((w) => {
          const tot = sum(w);
          return (
            <div key={w.week} className="flex min-w-10 flex-1 flex-col items-center gap-1" title={`Minggu ${w.week}: ${keys.map((k) => `${CAT_LABEL[k]} ${rb(w[k] ?? 0)}`).join(", ")}`}>
              <span className="text-[10px] font-semibold tabular">{rb(tot)}</span>
              <div className="flex w-full flex-col-reverse gap-[2px]" style={{ height: `${(tot / max) * 130}px` }}>
                {keys.map((k) => (w[k] ?? 0) > 0 && <div key={k} style={{ height: `${((w[k] ?? 0) / tot) * 100}%`, background: COLOR[k] }} className="w-full rounded-[2px]" />)}
              </div>
              <span className="text-[10px] text-muted">{w.week.slice(8)}/{w.week.slice(5, 7)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Funnel horizontal + konversi antar langkah. */
export function Funnel({ steps }: { steps: { label: string; n: number; pct: number | null }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <ol className="flex flex-col gap-2" aria-label="Funnel booking online">
      {steps.map((s) => (
        <li key={s.label} className="grid grid-cols-[130px_1fr_110px] items-center gap-2 text-sm">
          <span className="font-semibold">{s.label}</span>
          <span className="h-6 rounded-md bg-paper"><span className="block h-full rounded-md bg-ink" style={{ width: `${(s.n / max) * 100}%` }} /></span>
          <span className="text-right text-xs tabular"><b className="text-sm">{s.n}</b>{s.pct !== null && ` · ${s.pct.toLocaleString("id-ID", { maximumFractionDigits: 1 })}%`}</span>
        </li>
      ))}
    </ol>
  );
}
