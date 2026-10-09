import Link from "next/link";
import { SOP_STATUS, type SopStatus } from "@/lib/domain/kpi";

const wd = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
const long = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Riwayat 14 hari: strip tanggal 44×52 dengan titik status + label aksesibel. `href` null = tidak bisa dibuka (kapster). */
export function HistoryStrip({ rows, current, href }: { rows: { date: string; status: SopStatus }[]; current?: string; href: ((d: string) => string) | null }) {
  return (
    <ol aria-label="Riwayat 14 hari" className="flex gap-1.5 overflow-x-auto pb-1">
      {rows.map((r) => {
        const s = SOP_STATUS[r.status];
        const inner = (
          <>
            <span className="text-[10px] uppercase text-muted">{wd(r.date)}</span>
            <b className="text-sm tabular">{Number(r.date.slice(8))}</b>
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: r.status === "empty" || r.status === "closed" ? "#9A9C95" : s.fg }} />
          </>
        );
        const cls = `flex h-[52px] w-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-[10px] border ${r.date === current ? "border-ink bg-card" : "border-line bg-paper"}`;
        const label = `${long(r.date)}: ${s.label}`;
        return <li key={r.date}>{href ? <Link href={href(r.date)} aria-label={label} className={cls}>{inner}</Link> : <span aria-label={label} className={cls}>{inner}</span>}</li>;
      })}
    </ol>
  );
}
