"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { OfflineBanner, useToast } from "@/components/ui";
import { signOut } from "@/lib/auth-actions";
import { formatTanggal, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { stationLogout, stationPing } from "../stasiun/actions";
import { useKapster } from "./provider";
import { disablePush, enablePush, pushEnabled, pushSupported } from "./push";
import { BRAND_INITIALS } from "@/lib/brand";

const TABS = [["/kapster", "Hari ini"], ["/kapster/jadwal", "Jadwal"], ["/kapster/komisi", "Komisi"], ["/kapster/sop", "SOP"]] as const;
const IDLE_MS = 5 * 60 * 1000;

/** Mode stasiun: keluar otomatis setelah 5 menit tanpa aktivitas; aktivitas memperpanjang sesi di server. */
function useStationIdle(enabled: boolean) {
  const last = useRef(0);
  useEffect(() => {
    if (!enabled) return;
    last.current = Date.now();
    let pinged = Date.now();
    const bump = () => {
      last.current = Date.now();
      if (Date.now() - pinged > 60_000) { pinged = Date.now(); stationPing(); }
    };
    const evs = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
    evs.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    const t = setInterval(() => { if (Date.now() - last.current > IDLE_MS) stationLogout(); }, 10_000);
    return () => { evs.forEach((e) => window.removeEventListener(e, bump)); clearInterval(t); };
  }, [enabled]);
}

export function KapsterShell({ children }: { children: React.ReactNode }) {
  const { me, appts, offs, muted, setMuted } = useKapster();
  const path = usePathname();
  const toast = useToast();
  const [menu, setMenu] = useState(false);
  const [push, setPush] = useState<boolean | null>(null);
  useStationIdle(me.station);
  useEffect(() => { pushEnabled().then(setPush); }, []);

  const today = jktDate();
  const queue = (appts ?? []).filter((a) => jktDate(new Date(a.start_at)) === today)
    .filter((a) => ["booked", "arrived", "in_service"].includes(a.status)).length;
  const pending = (offs ?? []).filter((o) => o.status === "pending").length;
  // SOP: 1 bila checklist sterilisasi hari ini belum lengkap (perawatan fasilitas khusus manajer).
  const { data: sop } = useRealtimeTable(["sop_logs", "sop_approvals"], async () => {
    const { data: day } = await createClient().rpc("sop_day", { p_date: today, p_shift: 1 });
    const d = day as { done: number; total: number; closed: boolean } | null;
    return d && !d.closed && d.done < d.total ? 1 : 0;
  });
  const badge = (href: string) => (href === "/kapster" ? queue : href === "/kapster/sop" ? sop ?? 0 : 0);
  const role = me.category === "nail" ? "Nail artist" : "Kapster barbershop";

  async function togglePush() {
    if (push) { await disablePush(); setPush(false); toast("Notifikasi push dimatikan"); return; }
    const err = await enablePush();
    if (err) toast(err, "error"); else { setPush(true); toast("Notifikasi push aktif di perangkat ini"); }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-paper">
      <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 bg-ink px-4 text-paper">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-paper font-display text-sm font-bold text-ink">{BRAND_INITIALS}</span>
        <span className="flex min-w-0 flex-1 flex-col">
          <b className="truncate text-base">Halo, {me.name.split(" ")[0]}</b>
          <span className="truncate text-xs text-[#B9B3A7]">{role} · {formatTanggal(new Date())}</span>
        </span>
        <nav aria-label="Menu kapster" className="hidden gap-1 min-[900px]:flex">
          {TABS.map(([href, label]) => (
            <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
              className={`relative flex h-10 items-center rounded-[10px] px-3.5 text-sm font-bold ${path === href ? "bg-paper text-ink" : "text-[#D8D2C6] hover:bg-[#2A2926]"}`}>
              {label}{badge(href) > 0 && <span className="ml-1.5 rounded-full bg-[#D23B3B] px-1.5 text-[11px] text-white tabular">{badge(href)}</span>}
            </Link>
          ))}
        </nav>
        <div className="relative">
          <button onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Menu"
            className="flex size-10 items-center justify-center rounded-[10px] border border-[#3A3934] text-[#D8D2C6]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
          </button>
          {menu && (
            <div className="absolute right-0 top-12 z-30 flex w-72 flex-col gap-2 rounded-2xl bg-card p-3 text-ink shadow-[0_16px_40px_rgba(28,27,25,0.25)]">
              <Link href="/kapster/izin" onClick={() => setMenu(false)} className="flex min-h-12 items-center justify-between rounded-xl px-3 text-sm font-semibold hover:bg-paper">
                Izin / cuti {pending > 0 && <span className="rounded-full bg-[#D23B3B] px-2 text-[11px] text-white tabular">{pending}</span>}
              </Link>
              <button onClick={() => setMuted(!muted)} aria-pressed={!muted} className="flex min-h-12 items-center justify-between rounded-xl px-3 text-left text-sm font-semibold hover:bg-paper">
                Bunyi notifikasi <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${muted ? "bg-[#EFECE5] text-muted" : "bg-[#D9F2E1] text-[#144D2A]"}`}>{muted ? "Mati" : "Nyala"}</span>
              </button>
              {!me.station && (
                <button onClick={togglePush} disabled={!pushSupported() && !push} aria-pressed={!!push}
                  className="flex min-h-12 items-center justify-between rounded-xl px-3 text-left text-sm font-semibold hover:bg-paper disabled:opacity-50">
                  Notifikasi push (walau aplikasi ditutup)
                  <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${push ? "bg-[#D9F2E1] text-[#144D2A]" : "bg-[#EFECE5] text-muted"}`}>{push ? "Aktif" : "Mati"}</span>
                </button>
              )}
            </div>
          )}
        </div>
        {me.station ? (
          <form action={stationLogout}><button className="h-10 rounded-[10px] bg-paper px-3 text-[13px] font-bold text-ink">Ganti kapster</button></form>
        ) : (
          <form action={signOut}><button aria-label={`Keluar dari akun ${me.name}`} className="h-10 rounded-[10px] border border-[#3A3934] px-3 text-[13px] font-bold text-[#D8D2C6]">Keluar</button></form>
        )}
      </header>
      <OfflineBanner />
      <main className="mx-auto flex w-full max-w-[960px] flex-1 flex-col gap-4 px-4 pb-28 pt-4 min-[900px]:pb-8">{children}</main>
      <nav aria-label="Menu kapster" className="fixed inset-x-0 bottom-0 z-20 grid h-[72px] grid-cols-4 border-t border-line bg-card min-[900px]:hidden">
        {TABS.map(([href, label]) => (
          <Link key={href} href={href} aria-current={path === href ? "page" : undefined}
            className={`relative flex flex-col items-center justify-center gap-1 text-xs font-bold ${path === href ? "text-ink" : "text-muted"}`}>
            <span className={`h-1 w-7 rounded-sm ${path === href ? "bg-ink" : "bg-transparent"}`} />
            {label}
            {badge(href) > 0 && (
              <span aria-label={`${badge(href)} menunggu`} className="absolute right-[22%] top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#D23B3B] px-1 text-[11px] text-white tabular">{badge(href)}</span>
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
