import Link from "next/link";

/** Tab sebagai tautan ?tab= (server component). Sama dengan gaya tab Pengaturan. */
export function TabNav({ tabs, current, label, extra = "" }: { tabs: readonly (readonly [string, string])[]; current: string; label: string; extra?: string }) {
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map(([k, l]) => (
        <Link key={k} href={`?tab=${k}${extra}`} aria-current={current === k ? "page" : undefined}
          className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-4 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent">
          {l}
        </Link>
      ))}
    </nav>
  );
}
