"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Master } from "../counter/types";

type Brief = { lastAt: string; items: string[]; usual: { id: string; n: number } | null; visits: number };

const ago = (iso: string) => {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 864e5);
  return d <= 0 ? "hari ini" : d === 1 ? "kemarin" : d < 14 ? `${d} hari lalu` : `${Math.round(d / 7)} minggu lalu`;
};

/** Ringkasan pelanggan di titik layanan: kunjungan terakhir, layanan yang biasa diambil, dan capster langganan. */
export function CustomerBrief({ customerId, master }: { customerId: string; master: Master }) {
  const [b, setB] = useState<Brief | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    createClient().from("transactions").select("created_at, transaction_items(name, staff_id, category)")
      .eq("customer_id", customerId).is("voided_at", null).order("created_at", { ascending: false }).limit(5)
      .then(({ data }) => {
        if (!alive) return;
        if (!data?.length) return setB(null);
        const tally = new Map<string, number>();
        for (const t of data) for (const i of t.transaction_items) if (i.staff_id && i.category !== "retail") tally.set(i.staff_id, (tally.get(i.staff_id) ?? 0) + 1);
        const top = [...tally].sort((x, y) => y[1] - x[1])[0];
        setB({ lastAt: data[0].created_at, visits: data.length,
          items: [...new Set(data[0].transaction_items.filter((i) => i.category !== "retail").map((i) => i.name))],
          usual: top ? { id: top[0], n: top[1] } : null });
      });
    return () => { alive = false; };
  }, [customerId]);
  if (b === undefined) return null;
  if (b === null) return <p className="rounded-[14px] bg-paper p-3 text-[13px] text-muted">Pelanggan baru, belum ada riwayat transaksi.</p>;
  const usual = b.usual ? master.staff.find((s) => s.id === b.usual!.id)?.name : null;
  return (
    <div className="flex flex-col gap-0.5 rounded-[14px] bg-paper p-3 text-[13px] leading-normal">
      <span><b className="font-semibold">Terakhir {ago(b.lastAt)}</b>{b.items.length > 0 && <> · {b.items.join(", ")}</>}</span>
      {usual && <span className="text-muted">Biasanya dengan {usual} ({b.usual!.n} dari {b.visits} kunjungan terakhir)</span>}
    </div>
  );
}
