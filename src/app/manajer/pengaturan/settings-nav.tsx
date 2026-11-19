"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon, type IconName } from "@/components/icons";

const ICON: Record<string, IconName> = {
  umum: "store", jam: "clock", kursi: "box", layanan: "scissors", voucher: "tag", deposit: "cash", gaya: "image", staf: "users",
  akun: "key", stasiun: "tablet", sop: "clipboard", pelamar: "userplus", booking: "calendar", pesan: "message", notifikasi: "bell",
  publik: "globe", foto: "image", ulasan: "star", privasi: "lock", keuangan: "wallet", keamanan: "shield",
};

/** Menu kedua ala hPanel: kolom putih penuh tinggi, kolom cari, tiap item berikon; kelompok bisa dilipat. */
export function SettingsNav({ groups, current }: { groups: (readonly [string, readonly (readonly [string, string])[]])[]; current: string }) {
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const term = q.trim().toLowerCase();
  return (
    <nav aria-label="Menu pengaturan" className="sticky top-16 hidden h-[calc(100dvh-72px)] w-[264px] shrink-0 flex-col gap-3 overflow-y-auto bg-card px-3 py-4 lg:flex">
      <label className="relative block">
        <span className="sr-only">Cari pengaturan</span>
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 size-[18px] -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari pengaturan" type="search"
          className="h-11 w-full rounded-full bg-paper pl-11 pr-4 text-sm text-ink outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-accent/40" />
      </label>
      {groups.map(([label, subs]) => {
        const list = subs.filter(([, l]) => !term || l.toLowerCase().includes(term) || label.toLowerCase().includes(term));
        if (!list.length) return null;
        const shut = !term && closed[label] && !list.some(([k]) => k === current);
        return (
          <div key={label} className="flex flex-col gap-0.5">
            <button type="button" aria-expanded={!shut} onClick={() => setClosed({ ...closed, [label]: !closed[label] })}
              className="flex items-center justify-between rounded-[14px] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted hover:text-ink">
              {label}
              <Icon name="chevron" className={`size-4 transition-transform ${shut ? "-rotate-90" : ""}`} />
            </button>
            {!shut && list.map(([k, l]) => (
              <Link key={k} href={`?tab=${k}`} aria-current={current === k ? "page" : undefined}
                className="flex min-h-10 items-center gap-3 rounded-[14px] px-3 text-sm font-medium text-ink hover:bg-paper aria-[current=page]:bg-paper aria-[current=page]:font-semibold">
                <Icon name={ICON[k] ?? "gear"} className="size-[18px] shrink-0 text-ink/70" />{l}
              </Link>
            ))}
          </div>
        );
      })}
    </nav>
  );
}
