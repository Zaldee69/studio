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
const TABS = [["kasir", "Kasir"], ["riwayat", "Riwayat transaksi"], ["tutup", "Tutup kasir"], ["target", "Target & tugas"]] as const;
type Tab = (typeof TABS)[number][0];

export function KasirScreen({ master, initialAppt, bonusLine }: { master: Master; initialAppt: DayAppt | null; bonusLine?: string }) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((TABS.find(([k]) => k === params.get("tab"))?.[0]) ?? "kasir");
  // ≥1000px: satu layar tanpa scroll halaman; di bawahnya kolom bertumpuk & halaman bisa di-scroll
  return (
    <div className="flex flex-col gap-4 min-[1000px]:h-[calc(100dvh-112px)]">
      <div className="no-print flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[28px] font-medium tracking-tight">Kasir</h1>
          {bonusLine && <span className="rounded-full border border-line bg-card px-3 py-1 text-xs text-muted">{bonusLine}</span>}
          <span className="ml-auto"><PrinterButton /></span>
        </div>
        <div role="tablist" aria-label="Bagian kasir" className="flex max-w-full gap-1 overflow-x-auto border-b border-line">
          {TABS.filter(([k]) => k !== "target" || master.role === "cashier").map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className="inline-flex min-h-11 shrink-0 items-center border-b-2 border-transparent px-4 text-sm font-medium text-muted hover:text-ink aria-selected:border-accent aria-selected:font-semibold aria-selected:text-accent">{l}</button>
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
