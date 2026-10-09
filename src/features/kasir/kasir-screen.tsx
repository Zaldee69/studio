"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { PrinterButton } from "@/components/printer-button";
import type { DayAppt, Master } from "../counter/types";
import { Closing } from "./closing";
import { History } from "./history";
import { Pos } from "./pos";

const TABS = [["kasir", "Kasir"], ["riwayat", "Riwayat transaksi"], ["tutup", "Tutup kasir"]] as const;
type Tab = (typeof TABS)[number][0];

export function KasirScreen({ master, initialAppt }: { master: Master; initialAppt: DayAppt | null }) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>((TABS.find(([k]) => k === params.get("tab"))?.[0]) ?? "kasir");
  // ≥1000px: satu layar tanpa scroll halaman; di bawahnya kolom bertumpuk & halaman bisa di-scroll
  return (
    <div className="flex flex-col gap-3 min-[1000px]:h-[calc(100dvh-80px)] xl:h-[calc(100dvh-88px)]">
      <div className="no-print flex min-h-12 flex-wrap items-center gap-4">
        <h1 className="font-display text-[28px] font-bold tracking-tight">Kasir</h1>
        <div role="tablist" aria-label="Bagian kasir" className="flex max-w-full gap-1.5 overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={`h-11 shrink-0 rounded-full border px-4 text-[13px] font-bold ${tab === k ? "border-ink bg-ink text-white" : "border-[#D9D4C8] bg-card"}`}>{l}</button>
          ))}
        </div>
        <span className="hidden text-[13px] text-muted xl:inline">Gabungkan layanan barbershop &amp; nail dalam satu tagihan</span>
        <span className="ml-auto"><PrinterButton /></span>
      </div>
      {tab === "kasir" && <Pos master={master} initialAppt={initialAppt} />}
      {tab === "riwayat" && <History master={master} txParam={params.get("tx")} />}
      {tab === "tutup" && <Closing master={master} />}
    </div>
  );
}
