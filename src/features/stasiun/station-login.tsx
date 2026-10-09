"use client";

import { CAT_TONE, STAFF_TITLE, type Cat } from "@/lib/domain/category";

import { useActionState, useState } from "react";
import { stationLogin } from "./actions";

type S = { staff_id: string; name: string; category: Cat; has_pin: boolean };

/** Pilih nama → PIN pad besar (4–6 digit). Verifikasi & rate limit di server. */
export function StationLogin({ staff }: { staff: S[] }) {
  const [sel, setSel] = useState<S | null>(null);
  const [pin, setPin] = useState("");
  const [state, action, pending] = useActionState(stationLogin, undefined);

  if (!sel) {
    return (
      <div className="grid grid-cols-2 gap-3 min-[600px]:grid-cols-3">
        {staff.map((s) => (
          <button key={s.staff_id} onClick={() => { setSel(s); setPin(""); }} disabled={!s.has_pin}
            className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-2xl bg-paper p-4 text-ink disabled:opacity-40">
            <span className="flex size-14 items-center justify-center rounded-full text-xl font-bold"
              style={{ background: CAT_TONE[s.category].bg, color: CAT_TONE[s.category].fg }}>{s.name.charAt(0)}</span>
            <b className="text-lg">{s.name}</b>
            <span className="text-xs text-muted">{s.has_pin ? STAFF_TITLE[s.category] : "PIN belum diatur"}</span>
          </button>
        ))}
        {!staff.length && <p className="col-span-full text-[#D6D6D0]">Belum ada kapster dengan akun aktif.</p>}
      </div>
    );
  }

  const press = (d: string) => setPin((p) => (p.length < 6 ? p + d : p));
  return (
    <form action={action} className="mx-auto flex w-full max-w-[360px] flex-col items-center gap-5">
      <input type="hidden" name="staff_id" value={sel.staff_id} />
      <input type="hidden" name="pin" value={pin} />
      <b className="text-2xl">{sel.name}</b>
      <div aria-live="polite" aria-label={`${pin.length} digit dimasukkan`} className="flex h-6 gap-3">
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={`size-4 rounded-full border-2 border-paper ${i < pin.length ? "bg-paper" : ""}`} />
        ))}
      </div>
      {state?.error && <p role="alert" className="rounded-xl bg-[#F9E6E6] px-3 py-2 text-center text-sm font-semibold text-[#6E1616]">{state.error}</p>}
      <div className="grid w-full grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
          <button type="button" key={d} onClick={() => press(d)} className="h-[72px] rounded-2xl bg-[#2F332E] text-3xl font-bold tabular">{d}</button>
        ))}
        <button type="button" onClick={() => { setSel(null); setPin(""); }} className="h-[72px] rounded-2xl text-base font-bold text-[#D6D6D0]">Kembali</button>
        <button type="button" onClick={() => press("0")} className="h-[72px] rounded-2xl bg-[#2F332E] text-3xl font-bold">0</button>
        <button type="button" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Hapus digit" className="h-[72px] rounded-2xl text-2xl font-bold text-[#D6D6D0]">⌫</button>
      </div>
      <button disabled={pin.length < 4 || pending} className="h-[60px] w-full rounded-2xl bg-paper text-[17px] font-bold text-ink disabled:opacity-40">
        {pending ? "Memeriksa…" : "Masuk"}
      </button>
    </form>
  );
}
