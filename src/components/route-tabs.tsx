"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Tab antar-halaman (satu menu, beberapa halaman). Gaya sama dengan TabNav. */
export function RouteTabs({ tabs, label }: { tabs: readonly (readonly [string, string])[]; label: string }) {
  const path = usePathname();
  return (
    <nav aria-label={label} className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl bg-side p-1 print:hidden">
      {tabs.map(([href, l]) => (
        <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
          className="inline-flex h-10 shrink-0 items-center rounded-xl px-4 text-sm font-medium text-muted hover:text-ink aria-[current=page]:bg-card aria-[current=page]:font-semibold aria-[current=page]:text-ink aria-[current=page]:shadow-sm">
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
export const PELANGGAN_TABS = [["/manajer/pelanggan", "Daftar pelanggan"], ["/manajer/promosi", "Campaign WA"], ["/manajer/ulasan", "Ulasan"]] as const;
