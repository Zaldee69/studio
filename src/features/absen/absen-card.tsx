"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useOnline, useToast } from "@/components/ui";
import { formatJam, jktDate } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { absen } from "./actions";

/** Kartu absen di HP staf/kasir: satu tombol, status hari ini. Tidak dipakai di tablet stasiun (PIN bersama). */
export function AbsenCard() {
  const toast = useToast(); const online = useOnline();
  const [busy, setBusy] = useState(false);
  const { data: row, refresh } = useRealtimeTable(["attendance"], async () => {
    const { data } = await createClient().from("attendance").select("in_at, out_at, late_min, auto_out").eq("date", jktDate()).maybeSingle();
    return data ?? null;
  });

  async function go(aksi: "masuk" | "pulang") {
    setBusy(true);
    const r = await absen(aksi);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    toast(aksi === "masuk" ? (r.late_min ? `Absen masuk tercatat, terlambat ${r.late_min} menit` : "Absen masuk tercatat, tepat waktu") : "Absen pulang tercatat");
    refresh();
  }

  if (row === undefined) return null;
  const done = !!row?.out_at;
  return (
    <section aria-label="Absen" className="flex items-center gap-3 rounded-[14px] bg-card p-3.5">
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <b className="text-sm font-semibold">{!row ? "Belum absen masuk" : done ? "Absen selesai" : "Sedang bekerja"}</b>
        <span className="text-[13px] text-muted">
          {!row ? "Sambungkan HP ke WiFi toko, lalu ketuk Absen masuk."
            : <>Masuk {formatJam(row.in_at)}{row.late_min > 0 && ` · terlambat ${row.late_min} menit`}{done && ` · pulang ${formatJam(row.out_at!)}${row.auto_out ? " (otomatis)" : ""}`}</>}
        </span>
      </div>
      {!done && <Button onClick={() => go(row ? "pulang" : "masuk")} disabled={busy || !online} variant={row ? "outline" : "default"} className="h-11 shrink-0">
        {busy ? "Memeriksa…" : row ? "Absen pulang" : "Absen masuk"}</Button>}
    </section>
  );
}
