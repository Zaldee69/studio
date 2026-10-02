"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OwnerKind } from "@/lib/domain/owner";

const KINDS: [OwnerKind, string][] = [["bulan", "Bulan"], ["kuartal", "Kuartal"], ["tahun", "Tahun"], ["kustom", "Rentang"]];

/** Pilih periode laporan owner → URL (?periode=&nilai= / &dari=&sampai=). */
export function OwnerPeriodForm({ kind, value, from, to, today }: { kind: OwnerKind; value: string; from: string; to: string; today: string }) {
  const router = useRouter();
  const y = today.slice(0, 4);
  const [k, setK] = useState<OwnerKind>(kind);
  const [v, setV] = useState({
    bulan: kind === "bulan" ? value : today.slice(0, 7),
    kuartal: kind === "kuartal" ? value : `${y}-Q${Math.ceil(+today.slice(5, 7) / 3)}`,
    tahun: kind === "tahun" ? value : y,
    dari: from, sampai: to,
  });
  const years = Array.from({ length: 4 }, (_, i) => String(+y - i));
  function show(e: React.FormEvent) {
    e.preventDefault();
    const q = new URLSearchParams({ periode: k });
    if (k === "kustom") { q.set("dari", v.dari); q.set("sampai", v.sampai); } else q.set("nilai", v[k]);
    router.push(`/manajer/analitik/laporan?${q}`);
  }
  return (
    <form onSubmit={show} className="flex flex-wrap items-end gap-2">
      <label className="flex flex-col text-xs text-muted">Periode
        <select aria-label="Jenis periode" className="input h-11 w-32" value={k} onChange={(e) => setK(e.target.value as OwnerKind)}>
          {KINDS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </select>
      </label>
      {k === "bulan" && <input type="month" aria-label="Bulan" className="input h-11 w-44" value={v.bulan} max={today.slice(0, 7)} onChange={(e) => setV({ ...v, bulan: e.target.value })} />}
      {k === "kuartal" && (
        <select aria-label="Kuartal" className="input h-11 w-40" value={v.kuartal} onChange={(e) => setV({ ...v, kuartal: e.target.value })}>
          {years.flatMap((yy) => [4, 3, 2, 1].map((q) => `${yy}-Q${q}`)).map((o) => <option key={o} value={o}>{`Kuartal ${["I", "II", "III", "IV"][+o.slice(6) - 1]} ${o.slice(0, 4)}`}</option>)}
        </select>
      )}
      {k === "tahun" && (
        <select aria-label="Tahun" className="input h-11 w-28" value={v.tahun} onChange={(e) => setV({ ...v, tahun: e.target.value })}>
          {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
        </select>
      )}
      {k === "kustom" && (
        <>
          <input type="date" aria-label="Dari" className="input h-11 w-40" value={v.dari} onChange={(e) => setV({ ...v, dari: e.target.value })} />
          <input type="date" aria-label="Sampai" className="input h-11 w-40" value={v.sampai} onChange={(e) => setV({ ...v, sampai: e.target.value })} />
        </>
      )}
      <button className="btn-ghost h-11">Tampilkan</button>
    </form>
  );
}
