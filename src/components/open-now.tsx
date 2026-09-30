"use client";

import { useEffect, useState } from "react";
import { openStatus, type DayHours } from "@/lib/domain/hours";

/** Penanda Buka/Tutup (jam Asia/Jakarta), dihitung di browser supaya halaman tetap bisa di-cache (ISR). */
export function OpenNow({ hours, closures }: { hours: DayHours[]; closures: string[] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const t = setInterval(tick, 60_000);
    return () => { clearTimeout(first); clearInterval(t); };
  }, []);
  if (!now) return <span className="opacity-0">Memuat jam buka</span>;
  const s = openStatus(now, hours, closures);
  return (
    <span className="flex items-center gap-2">
      <span className={`size-1.5 rounded-full ${s.open ? "bg-[#5CC58A]" : "bg-[#E0806A]"}`} aria-hidden="true" />{s.label}
    </span>
  );
}
