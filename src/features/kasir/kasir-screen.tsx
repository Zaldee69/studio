"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PrinterButton } from "@/components/printer-button";
import type { DayAppt, Master } from "../counter/types";
import { Closing } from "./closing";
import { History } from "./history";
import { Pos } from "./pos";
import { MyTargets } from "../rencana/my-targets";

// "Target & tugas" hanya untuk akun kasir (delegasi manajer 10 Nov)
const TABS = [["kasir", "Transaksi baru"], ["riwayat", "Riwayat transaksi"], ["tutup", "Tutup kasir"], ["target", "Target & tugas"]] as const;
type Tab = (typeof TABS)[number][0];

export function KasirScreen({ master, initialAppt, bonusLine }: { master: Master; initialAppt: DayAppt | null; bonusLine?: string }) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((TABS.find(([k]) => k === params.get("tab"))?.[0]) ?? "kasir");
  // ≥1000px: tinggi minimal satu layar, halaman tumbuh mengikuti isi (tanpa scroll internal)
  return (
    <div className="flex flex-col gap-4 min-[1000px]:h-[calc(100dvh-112px)]">
      <div className="no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-col gap-0.5">
            <h1 className="font-display text-[28px] font-medium tracking-tight">Kasir</h1>
            {bonusLine && <span className="text-[13px] text-muted">{bonusLine}</span>}
          </div>
          <span className="ml-auto"><PrinterButton /></span>
        </div>
        <div role="tablist" aria-label="Bagian kasir" className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl bg-side p-1">
          {TABS.filter(([k]) => k !== "target" || master.role === "cashier").map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className="inline-flex h-10 shrink-0 items-center rounded-xl px-4 text-sm font-medium text-muted hover:text-ink aria-selected:bg-card aria-selected:font-semibold aria-selected:text-ink aria-selected:shadow-sm">{l}</button>
          ))}
        </div>
      </div>
      {tab === "kasir" && <Pos master={master} initialAppt={initialAppt} />}
      {tab === "riwayat" && <History master={master} txParam={params.get("tx")} />}
      {tab === "tutup" && <Closing master={master} />}
      {tab === "target" && master.role === "cashier" && <div className="max-w-3xl"><MyTargets /></div>}
    </div>
  );
}
