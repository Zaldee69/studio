"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { signOut } from "@/lib/auth-actions";
import type { MenuItem } from "@/lib/menus";
import { Icon } from "./icons";
import { useCounterAlerts } from "./counter-alerts";
import { NotificationBell, useStockAlerts } from "./notification-bell";
import { OfflineBanner, Sheet, ToastProvider } from "./ui";
import { BRAND } from "@/lib/brand";
import { LogoMark } from "./public-header";

// Sudut melengkung kontainer saat digulir: "telinga" bergradien di bawah bar atas & di dasar layar (md ke atas, sama dengan celah kontainer).
const EAR = "pointer-events-none absolute z-20 hidden size-7 bg-hpanel md:block print:hidden";
const EAR_TOP_L = `${EAR} left-2 top-full [mask-image:radial-gradient(circle_at_100%_100%,transparent_27.5px,#000_28px)]`;
const EAR_TOP_R = `${EAR} right-2 top-full [mask-image:radial-gradient(circle_at_0%_100%,transparent_27.5px,#000_28px)]`;

function useActive(menu: MenuItem[]) {
  const path = usePathname();
  // item terpanjang yang cocok (agar "/manajer" tidak aktif di "/manajer/jadwal")
  const hit = (h: string) => path === h || path.startsWith(h + "/");
  return menu.flatMap((m) => [m.href, ...(m.also ?? [])].filter(hit).map((h) => ({ m, h })))
    .sort((a, b) => b.h.length - a.h.length)[0]?.m.href;
}

/** Manajer & kasir: sidebar putih 224px ≥1280px, rail ikon 84px 768–1279px,
 *  tab bar bawah di HP (<768px): 4 menu pertama + "Lainnya" (sisa menu & keluar). */
type ShellProps = { menu: MenuItem[]; area: string; user: string; followCount?: number; children: React.ReactNode };

export function AdminShell(props: ShellProps) {
  return <ToastProvider><AdminShellInner {...props} /></ToastProvider>;
}

function AdminShellInner({ menu, area, user, followCount = 0, children }: ShellProps) {
  const active = useActive(menu);
  const path = usePathname();
  const initial = user.trim().charAt(0).toUpperCase();
  const base = menu[0]?.href.startsWith("/kasir") ? "/kasir" : "/manajer";
  const { ready, onlineNew } = useCounterAlerts(base);
  const stock = useStockAlerts(base === "/manajer");
  const [more, setMore] = useState(false);
  const slim = path.startsWith(`${base}/pengaturan`); // halaman bermenu kedua → menu utama hanya ikon (pola hPanel)
  const count = (m: MenuItem) => m.badge === "follow" ? followCount : m.badge === "ready" ? ready : m.badge === "online" ? onlineNew : m.badge === "stock" ? stock : 0;
  const badgeLabel = (m: MenuItem, n: number) => m.badge === "ready" ? `${n} siap bayar` : m.badge === "online" ? `${n} booking online baru` : m.badge === "stock" ? `${n} item perlu dibeli` : `${n} perlu follow-up`;
  const tabs = menu.slice(0, 4), rest = menu.slice(4);
  const restBadge = rest.reduce((n, m) => n + count(m), 0);
  const restActive = rest.some((m) => m.href === active);
  return (
      <div className="min-h-dvh bg-hpanel print:bg-white">
      {/* bar atas di atas gradien (pola hPanel): merek di kiri, lonceng & akun di kanan */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 bg-hpanel px-4 print:hidden md:h-16 md:px-5">
        <span aria-hidden="true" className={EAR_TOP_L} /><span aria-hidden="true" className={EAR_TOP_R} />
        <LogoMark className="h-9 w-auto shrink-0 text-white" />
        <span className="truncate font-display text-lg font-semibold text-white">{BRAND}</span>
        <span className="hidden rounded-full bg-white/25 px-3 py-1 text-xs font-semibold text-white sm:inline">{area}</span>
        <span className="flex-1" />
        <NotificationBell base={base} />
        <span className="flex items-center gap-2 rounded-full bg-white/90 py-1 pl-1 pr-3 text-sm text-ink">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">{initial}</span>
          <b className="hidden max-w-40 truncate text-[13px] min-[820px]:block">{user}</b>
        </span>
      </header>
      {/* dasar layar: strip gradien + telinga bawah, agar kontainer yang digulir tetap tampak membulat */}
      <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 bottom-0 z-20 hidden h-2 bg-hpanel md:block print:hidden" />
      <span aria-hidden="true" className="pointer-events-none fixed bottom-2 left-2 z-20 hidden size-7 bg-hpanel [mask-image:radial-gradient(circle_at_100%_0%,transparent_27.5px,#000_28px)] md:block print:hidden" />
      <span aria-hidden="true" className="pointer-events-none fixed bottom-2 right-2 z-20 hidden size-7 bg-hpanel [mask-image:radial-gradient(circle_at_0%_0%,transparent_27.5px,#000_28px)] md:block print:hidden" />
      <div className="flex min-h-[calc(100dvh-56px)] bg-paper md:mx-2 md:mb-2 md:min-h-[calc(100dvh-72px)] md:rounded-[28px] print:m-0 print:min-h-0">
        <nav aria-label="Menu utama"
          className={`sticky top-16 hidden h-[calc(100dvh-72px)] w-[84px] shrink-0 flex-col gap-1 rounded-l-[28px] bg-side px-2 py-4 text-ink print:hidden md:flex ${slim ? "" : "xl:w-60 xl:px-3 xl:py-5"}`}>
          <ul className="flex flex-1 flex-col gap-1 overflow-y-auto">
            {menu.map((m) => {
              const cur = active === m.href;
              const badge = count(m);
              return (
                <li key={m.href}>
                  <Link href={m.href} aria-current={cur ? "page" : undefined}
                    className={`relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-[14px] px-3 text-[11px] font-medium ${slim ? "" : "xl:min-h-12 xl:flex-row xl:justify-start xl:gap-3 xl:text-sm"} ${cur ? "bg-card font-semibold text-ink shadow-sm" : "text-ink/70 hover:bg-card/60 hover:text-ink"}`}>
                    <Icon name={m.icon} className="size-6 xl:size-[22px]" />
                    <span className={slim ? "" : "xl:hidden"}>{m.short ?? m.label}</span>
                    {!slim && <span className="hidden flex-1 xl:inline">{m.label}</span>}
                    {badge > 0 && (
                      <span aria-label={badgeLabel(m, badge)}
                        className={`absolute right-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs shadow-[0_0_0_2px_#FFFFFF] tabular ${slim ? "" : "xl:static xl:shadow-none"} ${m.badge === "ready" ? "bg-st-paid text-[#2C4A2A]" : m.badge === "online" ? "bg-[#F3E9CF] text-[#5C4A1A]" : "bg-st-completed text-[#6B2427]"}`}>
                        {badge}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
          <form action={signOut} className={slim ? "hidden" : "hidden border-t border-line pt-2 xl:block"}>
            <button className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-sm font-medium text-ink hover:bg-card/60">
              <Icon name="logout" className="size-[20px]" />Keluar
            </button>
          </form>
          <form action={signOut} className={`mt-1 border-t border-line pt-2 ${slim ? "" : "xl:hidden"}`}>
            <button aria-label={`Keluar (${user})`} className="flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-[14px] px-1 text-[11px] font-medium text-ink/70 hover:bg-card/60 hover:text-ink">
              <Icon name="logout" className="size-6" />Keluar
            </button>
          </form>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col">
          <OfflineBanner />
          <main className="min-w-0 flex-1 p-4 pb-[calc(88px+env(safe-area-inset-bottom))] md:pb-4 xl:px-6 xl:py-5">{children}</main>
        </div>

        {/* HP: tab bar bawah menggantikan rail */}
        <nav aria-label="Menu utama" className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-card pb-[env(safe-area-inset-bottom)] print:hidden md:hidden">
          {tabs.map((m) => {
            const cur = active === m.href, n = count(m);
            return (
              <Link key={m.href} href={m.href} aria-current={cur ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${cur ? "text-ink" : "text-muted"}`}>
                <span className={`absolute inset-x-4 top-0 h-[3px] rounded-b ${cur ? "bg-accent" : ""}`} />
                <Icon name={m.icon} className="size-5" />
                {m.short ?? m.label}
                {n > 0 && <span aria-label={badgeLabel(m, n)} className="absolute left-1/2 top-1.5 ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#D23B3B] px-1 text-[11px] text-white tabular">{n}</span>}
              </Link>
            );
          })}
          <button type="button" onClick={() => setMore(true)} aria-haspopup="dialog" aria-expanded={more}
            className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${restActive ? "text-ink" : "text-muted"}`}>
            <span className={`absolute inset-x-4 top-0 h-[3px] rounded-b ${restActive ? "bg-accent" : ""}`} />
            <Icon name="more" className="size-5" />
            Lainnya
            {restBadge > 0 && <span aria-label={`${restBadge} perlu perhatian`} className="absolute left-1/2 top-1.5 ml-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#D23B3B] px-1 text-[11px] text-white tabular">{restBadge}</span>}
          </button>
        </nav>
        <Sheet open={more} onClose={() => setMore(false)} label="Menu lainnya">
          <div className="flex flex-col gap-1 p-4">
            <div className="flex items-center gap-3 px-2 pb-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-sm font-semibold text-white">{initial}</span>
              <span className="flex min-w-0 flex-1 flex-col"><b className="truncate">{user}</b><span className="text-xs text-muted">{area}</span></span>
            </div>
            {rest.map((m) => {
              const cur = active === m.href, n = count(m);
              return (
                <Link key={m.href} href={m.href} onClick={() => setMore(false)} aria-current={cur ? "page" : undefined}
                  className={`flex min-h-12 items-center gap-3 rounded-[14px] px-3 text-sm font-medium ${cur ? "bg-card text-ink shadow-sm" : "hover:bg-paper"}`}>
                  <Icon name={m.icon} className="size-[18px]" />
                  <span className="flex-1">{m.label}</span>
                  {n > 0 && <span aria-label={badgeLabel(m, n)} className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F9E6E6] px-1.5 text-xs text-[#6E1616] tabular">{n}</span>}
                </Link>
              );
            })}
            <form action={signOut} className="mt-2 border-t border-line pt-3">
              <button className="flex min-h-12 w-full items-center gap-3 rounded-[14px] px-3 text-sm font-medium text-danger hover:bg-paper">
                <Icon name="logout" className="size-[18px]" />Keluar
              </button>
            </form>
            <Button type="button" onClick={() => setMore(false)} variant="outline" className="mt-1 h-11 rounded-[14px]">Tutup</Button>
          </div>
        </Sheet>
      </div>
      </div>
  );
}
