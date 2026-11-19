import Link from "next/link";

/** Tab sebagai tautan ?tab= (server component): kontrol segmen, tab aktif = kartu putih. Bisa digeser ke samping di HP. */
export function TabNav({ tabs, current, label, extra = "" }: { tabs: readonly (readonly [string, string])[]; current: string; label: string; extra?: string }) {
  return (
    <nav aria-label={label} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl bg-side p-1">
      {tabs.map(([k, l]) => (
        <Link key={k} href={`?tab=${k}${extra}`} aria-current={current === k ? "page" : undefined}
          className="inline-flex h-10 shrink-0 items-center rounded-xl px-4 text-sm font-medium text-muted hover:text-ink aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:shadow-sm">
          {l}
        </Link>
      ))}
    </nav>
  );
}
