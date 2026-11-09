"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tab antar-halaman (satu menu, beberapa halaman). Gaya sama dengan TabNav. */
export function RouteTabs({ tabs, label }: { tabs: readonly (readonly [string, string])[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line print:hidden">
      {tabs.map(([href, l]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
          className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-4 text-sm text-muted aria-[current=page]:border-accent aria-[current=page]:font-semibold aria-[current=page]:text-accent">
          {l}
        </Link>
      ))}
    </nav>
  );
}

export const RENCANA_TABS = [
  ["/manajer/rencana", "Progres & tugas"], ["/manajer/analitik", "Analitik KPI"],
  ["/manajer/analitik/campaign", "Laporan campaign"], ["/manajer/analitik/laporan", "Laporan owner"],
] as const;
export const PELANGGAN_TABS = [["/manajer/pelanggan", "Daftar pelanggan"], ["/manajer/promosi", "Campaign WA"]] as const;
