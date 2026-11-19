import Link from "next/link";

/** Pemilih periode (minggu/bulan): ‹ label › dalam satu pil, lalu lencana status. Tombol aksi diberikan lewat children (rata kanan). */
export function PeriodNav({ prev, next, label, prevLabel, nextLabel, status, tone, children }: {
  prev: string; next: string; label: string; prevLabel: string; nextLabel: string; status: string;
  tone: "ok" | "warn" | "late" | "idle"; children?: React.ReactNode;
}) {
  const TONE = { ok: "bg-[#E3F4EA] text-[#1D5A3A]", warn: "bg-[#FBF2E4] text-[#6B4A10]", late: "bg-[#FBEEEC] text-[#6E1616]", idle: "bg-side text-muted" } as const;
  const arrow = "flex size-11 items-center justify-center rounded-xl text-lg text-muted hover:bg-paper hover:text-ink";
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <div className="flex items-center rounded-2xl border border-line bg-card p-0.5">
        <Link href={prev} aria-label={prevLabel} className={arrow}>‹</Link>
        <b className="min-w-40 px-1 text-center font-display text-base font-semibold tabular">{label}</b>
        <Link href={next} aria-label={nextLabel} className={arrow}>›</Link>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE[tone]}`}>{status}</span>
      {children && <div className="ml-auto flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}
