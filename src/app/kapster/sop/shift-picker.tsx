import Link from "next/link";

export function ShiftPicker({ shift, names }: { shift: number; names: string[] }) {
  return (
    <div role="group" aria-label="Shift" className="flex gap-1.5">
      {[1, 2].map((s) => (
        <Link key={s} href={`?shift=${s}`} aria-current={shift === s ? "true" : undefined}
          className="inline-flex h-12 items-center rounded-full border border-[#DCDCD6] bg-card px-5 text-sm font-bold aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-white">{names[s - 1] ?? `Shift ${s}`}</Link>
      ))}
    </div>
  );
}
