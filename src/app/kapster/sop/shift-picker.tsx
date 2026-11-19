import Link from "next/link";

export function ShiftPicker({ shift, names }: { shift: number; names: string[] }) {
  return (
    <div role="group" aria-label="Shift" className="flex gap-1.5">
      {[1, 2].map((s) => (
        <Link key={s} href={`?shift=${s}`} aria-current={shift === s ? "true" : undefined}
          className="inline-flex h-12 items-center rounded-full border border-[#D5D8DE] bg-card px-5 text-sm font-semibold aria-[current=true]:border-accent aria-[current=true]:bg-accent aria-[current=true]:text-white">{names[s - 1] ?? `Shift ${s}`}</Link>
      ))}
    </div>
  );
}
