"use client";

import { DateInput } from "@/components/date-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { OwnerKind } from "@/lib/domain/owner";

const KINDS: [OwnerKind, string][] = [["minggu", "Minggu"], ["bulan", "Bulan"], ["kuartal", "Kuartal"], ["tahun", "Tahun"], ["kustom", "Rentang"]];

/** Pilih periode laporan owner → URL (?periode=&nilai= / &dari=&sampai=). */
export function OwnerPeriodForm({ kind, value, from, to, today }: { kind: OwnerKind; value: string; from: string; to: string; today: string }) {
  const router = useRouter();
  const y = today.slice(0, 4);
  const [k, setK] = useState<OwnerKind>(kind);
  const [v, setV] = useState({
    minggu: kind === "minggu" ? value : "",
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
        <NativeSelect aria-label="Jenis periode" className="h-11 w-32" value={k} onChange={(e) => setK(e.target.value as OwnerKind)}>
          {KINDS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}
        </NativeSelect>
      </label>
      {k === "minggu" && <DateInput aria-label="Tanggal dalam minggu" title="Pilih tanggal mana pun — laporan memakai Senin–Minggu" className="h-11 w-44" value={v.minggu} max={today} onChange={(e) => setV({ ...v, minggu: e.target.value })} />}
      {k === "bulan" && <Input type="month" aria-label="Bulan" className="h-11 w-44" value={v.bulan} max={today.slice(0, 7)} onChange={(e) => setV({ ...v, bulan: e.target.value })} />}
      {k === "kuartal" && (
        <NativeSelect aria-label="Kuartal" className="h-11 w-40" value={v.kuartal} onChange={(e) => setV({ ...v, kuartal: e.target.value })}>
          {years.flatMap((yy) => [4, 3, 2, 1].map((q) => `${yy}-Q${q}`)).map((o) => <option key={o} value={o}>{`Kuartal ${["I", "II", "III", "IV"][+o.slice(6) - 1]} ${o.slice(0, 4)}`}</option>)}
        </NativeSelect>
      )}
      {k === "tahun" && (
        <NativeSelect aria-label="Tahun" className="h-11 w-28" value={v.tahun} onChange={(e) => setV({ ...v, tahun: e.target.value })}>
          {years.map((yy) => <option key={yy} value={yy}>{yy}</option>)}
        </NativeSelect>
      )}
      {k === "kustom" && (
        <>
          <DateInput aria-label="Dari" className="h-11 w-40" value={v.dari} onChange={(e) => setV({ ...v, dari: e.target.value })} />
          <DateInput aria-label="Sampai" className="h-11 w-40" value={v.sampai} onChange={(e) => setV({ ...v, sampai: e.target.value })} />
        </>
      )}
      <Button variant="outline" className="h-11">Tampilkan</Button>
    </form>
  );
}
