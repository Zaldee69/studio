"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "@/lib/auth-actions";
import type { MenuItem } from "@/lib/menus";
import { Icon } from "./icons";
import { useCounterAlerts } from "./counter-alerts";
import { NotificationBell, useStockAlerts } from "./notification-bell";
import { OfflineBanner, ToastProvider } from "./ui";

function useActive(menu: MenuItem[]) {
  const path = usePathname();
  // item terpanjang yang cocok (agar "/manajer" tidak aktif di "/manajer/jadwal")
  return menu.filter((m) => path === m.href || path.startsWith(m.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

/** Manajer & kasir (desain Main.dc.html): sidebar gelap 224px ≥1280px, rail ikon 84px di bawahnya. */
type ShellProps = { menu: MenuItem[]; area: string; user: string; followCount?: number; children: React.ReactNode };

export function AdminShell(props: ShellProps) {
  return <ToastProvider><AdminShellInner {...props} /></ToastProvider>;
}

function AdminShellInner({ menu, area, user, followCount = 0, children }: ShellProps) {
  const active = useActive(menu);
  const initial = user.trim().charAt(0).toUpperCase();
  const base = menu[0]?.href.startsWith("/kasir") ? "/kasir" : "/manajer";
  const { ready, onlineNew } = useCounterAlerts(base);
  const stock = useStockAlerts(base === "/manajer");
  return (
      <div className="flex min-h-dvh">
        <nav aria-label="Menu utama"
          className="sticky top-0 flex h-dvh w-[84px] shrink-0 flex-col gap-1 bg-ink px-2 py-4 text-paper print:hidden xl:w-56 xl:px-4 xl:py-6">
          <div className="mb-3 flex h-12 items-center justify-center rounded-xl bg-paper font-display text-[17px] font-bold tracking-tight text-ink xl:hidden" aria-label="Groom & Bloom">G&amp;B</div>
          <div className="hidden flex-col gap-1 px-2 pb-6 xl:flex">
            <span className="font-display text-2xl font-bold tracking-tight">Groom &amp; Bloom</span>
            <span className="text-xs text-[#B9B3A7]">Barbershop · Nail Spa — {area}</span>
          </div>
          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {menu.map((m) => {
              const cur = active === m.href;
              const badge = m.badge === "follow" ? followCount : m.badge === "ready" ? ready : m.badge === "online" ? onlineNew : m.badge === "stock" ? stock : 0;
              return (
                <li key={m.href}>
                  <Link href={m.href} aria-current={cur ? "page" : undefined}
                    className={`relative flex min-h-16 flex-col items-center justify-center gap-1 rounded-[10px] px-3 text-[11px] font-semibold xl:min-h-11 xl:flex-row xl:justify-start xl:gap-3 xl:text-sm ${cur ? "bg-paper text-ink" : "text-[#D8D2C6] hover:bg-[#2A2926]"}`}>
                    <Icon name={m.icon} className="size-[18px]" />
                    <span className="xl:hidden">{m.short ?? m.label}</span>
                    <span className="hidden flex-1 xl:inline">{m.label}</span>
                    {badge > 0 && (
                      <span aria-label={m.badge === "ready" ? `${badge} siap bayar` : m.badge === "online" ? `${badge} booking online baru` : m.badge === "stock" ? `${badge} item perlu dibeli` : `${badge} perlu follow-up`}
                        className={`absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs shadow-[0_0_0_2px_#1C1B19] tabular xl:static xl:shadow-none ${m.badge === "ready" ? "bg-[#D9F2E1] text-[#144D2A]" : m.badge === "online" ? "bg-[#C9A45C] text-[#1C1B19]" : "bg-[#FFDADA] text-[#6E1616]"}`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="hidden items-center gap-2.5 px-1 pt-2.5 xl:flex">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-paper text-sm font-bold text-ink">{initial}</span>
            <span className="flex min-w-0 flex-1 flex-col text-xs"><b className="truncate text-[13px] text-paper">{user}</b><span className="text-[#B9B3A7]">{area}</span></span>
            <form action={signOut}>
              <button aria-label="Keluar" className="flex size-10 items-center justify-center rounded-[10px] border border-[#3A3934] text-[#D8D2C6]"><Icon name="logout" className="size-4" /></button>
            </form>
          </div>
          <form action={signOut} className="xl:hidden">
            <button aria-label={`Keluar (${user})`} className="flex min-h-[60px] w-full flex-col items-center justify-center gap-1 rounded-[10px] text-[11px] font-semibold text-[#D8D2C6]">
              <span className="flex size-[30px] items-center justify-center rounded-full bg-paper text-[13px] font-bold text-ink">{initial}</span>Keluar
            </button>
          </form>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-b border-line bg-paper/95 px-4 backdrop-blur print:hidden xl:px-6">
            <span className="flex-1 truncate text-sm font-semibold text-muted">{menu.find((m) => m.href === active)?.label ?? area}</span>
            <NotificationBell base={base} />
            <span className="flex items-center gap-2 text-sm">
              <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-ink text-xs font-bold text-paper">{initial}</span>
              <span className="hidden flex-col leading-tight min-[820px]:flex"><b className="max-w-40 truncate text-[13px]">{user}</b><span className="text-[11px] text-muted">{area}</span></span>
            </span>
          </header>
          <OfflineBanner />
          <main className="min-w-0 flex-1 p-4 xl:px-6 xl:py-5">{children}</main>
        </div>
      </div>
  );
}

export function Segera({ title }: { title: string }) {
  return (
    <div>
      <h1 className="font-display text-3xl font-bold">{title}</h1>
      <div className="mt-6 rounded-2xl border border-dashed border-line bg-card p-10 text-center text-muted">
        <p className="font-display text-lg font-semibold text-ink">Segera</p>
        <p className="mt-1 text-sm">Modul ini dibangun di tahap berikutnya.</p>
      </div>
    </div>
  );
}
