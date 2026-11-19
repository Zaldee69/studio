"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cancelBooking, confirmBooking } from "./actions";

/** Tiga pilihan untuk pelanggan: datang, batalkan, atau ubah jadwal lewat WhatsApp. Tanpa login. */
export function BookingActions({ token, confirmed, cancellable, cutoff, wa }: { token: string; confirmed: boolean; cancellable: boolean; cutoff: number; wa: string }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(confirmed ? { ok: true, text: "Kehadiran Kakak sudah kami catat. Sampai bertemu!" } : null);
  const [ask, setAsk] = useState(false);
  const [pending, start] = useTransition();
  const run = (f: (t: string) => Promise<{ ok: boolean; message: string }>) => start(async () => { const r = await f(token); setMsg({ ok: r.ok, text: r.message }); setAsk(false); });
  return (
    <div className="flex flex-col gap-3">
      {msg && <p role="status" className={`rounded-2xl p-4 text-[15px] ${msg.ok ? "bg-[#E3F4EA] text-[#1D5A3A]" : "bg-[#FBEEEC] text-[#6E1616]"}`}>{msg.text}</p>}
      {!msg?.ok && (
        <>
          <Button onClick={() => run(confirmBooking)} disabled={pending} className="h-14 text-base">Ya, saya datang</Button>
          {ask ? (
            <div className="flex flex-col gap-2 rounded-2xl border border-line p-4">
              <span className="text-[15px]">Batalkan booking ini?</span>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setAsk(false)} className="h-12 flex-1">Tidak</Button>
                <Button onClick={() => run(cancelBooking)} disabled={pending} className="h-12 flex-1">Ya, batalkan</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => setAsk(true)} disabled={pending || !cancellable} className="h-14 text-base">Batalkan booking</Button>
          )}
          {!cancellable && <p className="text-[13px] text-muted">Pembatalan lewat tautan hanya sampai {cutoff} jam sebelum jadwal.</p>}
          {wa && <a href={`https://wa.me/${wa}`} className="flex h-14 items-center justify-center rounded-[14px] border border-line text-base font-medium">Ubah jadwal lewat WhatsApp</a>}
        </>
      )}
    </div>
  );
}
