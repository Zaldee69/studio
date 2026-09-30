"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Empty, Field, useOnline, useToast } from "@/components/ui";
import { formatJam, formatRupiah, formatTanggal } from "@/lib/domain/format";
import { opnameMoves } from "@/lib/domain/inventory";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";
import { qtyFmt, SCOPE_LABEL } from "./types";

export type OpnameRow = { id: string; scope: string; status: string; started_at: string; approved_at: string | null; starter: string; approver: string; value: number | null; counted: number; total: number };

/** Mulai opname baru (manajer & kasir). */
export function StartOpname({ base, drafts }: { base: string; drafts: { scope: string }[] }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [scope, setScope] = useState("consumable");
  const taken = drafts.some((d) => d.scope === scope);
  async function start() {
    const { data, error } = await createClient().rpc("opname_start", { p_scope: scope });
    if (error) return toast(error.message, "error");
    router.push(`${base}/${data}`);
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-4">
      <Field label="Cakupan" htmlFor="op-scope">
        <select id="op-scope" className="input w-48" value={scope} onChange={(e) => setScope(e.target.value)}>
          {Object.entries(SCOPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </Field>
      <button disabled={!online || taken} onClick={start} className="btn-ink h-11">Mulai opname</button>
      {taken && <span role="status" className="text-sm text-[#5A4300]">Sudah ada opname {SCOPE_LABEL[scope]} yang belum selesai — lanjutkan di bawah.</span>}
    </div>
  );
}

export function OpnameList({ rows, base, showValue }: { rows: OpnameRow[]; base: string; showValue: boolean }) {
  const drafts = rows.filter((r) => r.status === "draft");
  const done = rows.filter((r) => r.status !== "draft");
  return (
    <div className="flex flex-col gap-4">
      <StartOpname base={base} drafts={drafts} />
      <section className="flex flex-col gap-2">
        <h2 className="text-base font-bold">Sedang berjalan</h2>
        {!drafts.length ? <Empty>Tidak ada opname draft.</Empty> : drafts.map((d) => (
          <Link key={d.id} href={`${base}/${d.id}`} className="flex min-h-14 items-center gap-3 rounded-[14px] border-2 border-[#EBCB67] bg-[#FFFBEB] px-4 py-3">
            <span className="flex flex-1 flex-col"><b>{SCOPE_LABEL[d.scope]} · dimulai {formatTanggal(d.started_at)} {formatJam(d.started_at)}</b>
              <span className="text-xs text-muted">oleh {d.starter} · {d.counted}/{d.total} item dihitung</span></span>
            <span className="btn-ink h-11">Lanjutkan →</span>
          </Link>
        ))}
      </section>
      {showValue && (
        <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
          <h2 className="text-base font-bold">Riwayat opname</h2>
          {!done.length ? <p className="text-sm text-muted">Belum ada.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm tabular">
                <thead><tr className="text-left text-xs text-muted">{["Tanggal", "Cakupan", "Penghitung", "Penyetuju", "Status", "Nilai selisih"].map((h, i) => <th key={h} className={`py-2 font-semibold ${i === 5 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {done.map((r) => (
                    <tr key={r.id} className="border-t border-[#F0EDE6]">
                      <td className="py-2"><Link className="font-semibold underline" href={`${base}/${r.id}`}>{formatTanggal(r.started_at)}</Link></td>
                      <td>{SCOPE_LABEL[r.scope]}</td><td>{r.starter}</td><td>{r.approver || "—"}</td>
                      <td>{r.status === "approved" ? "Disetujui" : "Dibatalkan"}</td>
                      <td className={`text-right font-bold ${(r.value ?? 0) < 0 ? "text-[#A12A2A]" : ""}`}>{r.status === "approved" ? signed(r.value ?? 0) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

const signed = (v: number) => (v < 0 ? "−" : v > 0 ? "+" : "") + formatRupiah(Math.abs(v));
type Line = { item_id: string; name: string; kind: string; unit: string; system_qty: number; counted_qty: number | null };

/**
 * Layar hitung (tablet): input angka besar + tombol ±, kolom Sistem & Selisih langsung. Simpan sebagian kapan saja,
 * dilanjutkan di perangkat lain. Manajer melihat nilai rupiah & bisa menyetujui; kasir hanya jumlah.
 */
export function OpnameCount({ opname, manager, back }: { opname: { id: string; scope: string; status: string; started_at: string }; manager: boolean; back: string }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const locked = opname.status !== "draft";
  const { data, refresh } = useRealtimeTable(["stock_opname_lines", "stock_opnames"], async () => {
    const supabase = createClient();
    const { data: lines } = await supabase.from("opname_sheet").select("item_id, name, kind, unit, system_qty, counted_qty").eq("opname_id", opname.id).order("name");
    const costs = manager ? (await supabase.from("stock_opname_lines").select("item_id, unit_cost").eq("opname_id", opname.id)).data ?? [] : [];
    return { lines: (lines ?? []) as Line[], cost: Object.fromEntries(costs.map((c) => [c.item_id, Number(c.unit_cost)])) as Record<string, number> };
  }, opname.id);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const lines = data?.lines ?? [];
  const val = (l: Line): number | null => {
    if (l.item_id in edits) { const s = edits[l.item_id].trim(); return s === "" ? null : Number(s.replace(",", ".")); }
    return l.counted_qty === null ? null : Number(l.counted_qty);
  };
  const dirty = Object.keys(edits).filter((id) => { const l = lines.find((x) => x.item_id === id); return l && val(l) !== (l.counted_qty === null ? null : Number(l.counted_qty)); });
  const summary = opnameMoves(lines.map((l) => ({ itemId: l.item_id, system: Number(l.system_qty), counted: val(l), unitCost: data?.cost[l.item_id] ?? 0 })));
  const counted = lines.filter((l) => val(l) !== null).length;
  const biggest = [...summary.moves].sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, 5);
  const invalid = lines.some((l) => { const v = val(l); return v !== null && !(v >= 0); });

  async function saveCounts() {
    if (invalid) return toast("Hitungan tidak boleh minus", "error");
    setBusy(true);
    const { error } = await createClient().rpc("opname_save_counts", { p_opname_id: opname.id, p_lines: dirty.map((id) => ({ item_id: id, counted_qty: val(lines.find((l) => l.item_id === id)!) })) });
    setBusy(false);
    if (error) return toast(error.message, "error");
    toast(`${dirty.length} hitungan tersimpan`); setEdits({}); refresh();
    return true;
  }
  async function approve() {
    if (dirty.length && !(await saveCounts())) return;
    if (!confirm(`${summary.moves.length} penyesuaian senilai ${signed(summary.value)} akan dicatat. Setujui opname?`)) return;
    const { error } = await createClient().rpc("opname_approve", { p_opname_id: opname.id });
    if (error) return toast(error.message, "error");
    toast("Opname disetujui — stok diperbarui"); router.push(back);
  }
  async function cancel() {
    if (!confirm("Batalkan opname ini? Hitungan tidak dipakai.")) return;
    const { error } = await createClient().rpc("opname_cancel", { p_opname_id: opname.id });
    if (error) return toast(error.message, "error");
    router.push(back);
  }
  const bump = (l: Line, d: number) => setEdits({ ...edits, [l.item_id]: String(Math.max(0, (val(l) ?? Number(l.system_qty)) + d)) });

  return (
    <div className="flex flex-col gap-4 pb-28">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={back} className="btn-ghost h-11">← Kembali</Link>
        <h1 className="flex-1 font-display text-[26px] font-bold">Opname {SCOPE_LABEL[opname.scope]} · {formatTanggal(opname.started_at)}</h1>
        {locked && <span className="rounded-full bg-paper px-3 py-1 text-sm font-bold">{opname.status === "approved" ? "Disetujui" : "Dibatalkan"}</span>}
      </div>
      <div className="grid gap-3 min-[820px]:grid-cols-3">
        <div className="rounded-[14px] border border-line bg-card p-4"><span className="text-xs text-muted">Dihitung</span><b className="block text-2xl tabular">{counted} / {lines.length}</b></div>
        {manager && <div className="rounded-[14px] border border-line bg-card p-4"><span className="text-xs text-muted">Total nilai selisih</span>
          <b className={`block text-2xl tabular ${summary.value < 0 ? "text-[#A12A2A]" : ""}`}>{signed(summary.value)}</b></div>}
        {manager && <div className="rounded-[14px] border border-line bg-card p-4 text-sm"><span className="text-xs text-muted">Selisih terbesar</span>
          {!biggest.length ? <p className="text-muted">—</p> : biggest.map((b) => <div key={b.itemId} className="flex justify-between tabular"><span>{lines.find((l) => l.item_id === b.itemId)?.name}</span><b>{signed(b.value)}</b></div>)}</div>}
      </div>
      <input type="search" aria-label="Cari item" placeholder="Cari item…" className="input max-w-sm" value={q} onChange={(e) => setQ(e.target.value)} />
      {!data ? <Empty>Memuat…</Empty> : (["consumable", "retail"] as const).map((k) => {
        const group = lines.filter((l) => l.kind === k && l.name.toLowerCase().includes(q.trim().toLowerCase()));
        if (!group.length) return null;
        return (
          <section key={k} className="flex flex-col gap-2">
            <h2 className="text-base font-bold">{k === "consumable" ? "Bahan HPP" : "Barang ritel"}</h2>
            {group.map((l) => {
              const v = val(l);
              const diff = v === null ? null : v - Number(l.system_qty);
              const tone = diff === null ? "text-muted" : diff < 0 ? "text-[#A12A2A]" : diff > 0 ? "text-[#1F7A45]" : "text-muted";
              return (
                <div key={l.item_id} className="grid grid-cols-[1fr_auto] items-center gap-3 rounded-[14px] border border-line bg-card p-3 min-[820px]:grid-cols-[1fr_120px_auto_120px]">
                  <span className="flex flex-col"><b className="text-[15px]">{l.name}</b><span className="text-xs text-muted">{l.unit}</span></span>
                  <span className="hidden text-sm tabular min-[820px]:block">Sistem <b>{qtyFmt(Number(l.system_qty))}</b></span>
                  <div className="flex items-center gap-1.5">
                    <button type="button" disabled={locked} aria-label={`Kurangi ${l.name}`} onClick={() => bump(l, -1)} className="btn-ghost size-12 p-0 text-xl">−</button>
                    <label className="sr-only" htmlFor={`oc-${l.item_id}`}>Hitungan fisik {l.name}</label>
                    <input id={`oc-${l.item_id}`} inputMode="decimal" disabled={locked} placeholder="—"
                      className="input h-12 w-24 text-center text-xl font-bold tabular" value={l.item_id in edits ? edits[l.item_id] : l.counted_qty === null ? "" : String(Number(l.counted_qty))}
                      onChange={(e) => setEdits({ ...edits, [l.item_id]: e.target.value })} />
                    <button type="button" disabled={locked} aria-label={`Tambah ${l.name}`} onClick={() => bump(l, 1)} className="btn-ghost size-12 p-0 text-xl">+</button>
                  </div>
                  <span className={`col-span-2 text-sm font-bold tabular min-[820px]:col-span-1 min-[820px]:text-right ${tone}`}>
                    <span className="font-normal text-muted min-[820px]:hidden">Sistem {qtyFmt(Number(l.system_qty))} · </span>
                    {diff === null ? "Belum dihitung" : `Selisih ${diff > 0 ? "+" : ""}${qtyFmt(diff)}`}
                  </span>
                </div>
              );
            })}
          </section>
        );
      })}
      {!locked && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-card/95 px-4 py-3 backdrop-blur left-[84px] xl:left-56">
          <span className="mr-auto text-sm text-muted">{dirty.length ? `${dirty.length} perubahan belum disimpan` : "Semua hitungan tersimpan"}</span>
          {manager && <button onClick={cancel} disabled={!online} className="btn-ghost h-12 text-[#A12A2A]">Batalkan opname</button>}
          <button onClick={saveCounts} disabled={!online || busy || !dirty.length} className="btn-ghost h-12">Simpan sebagian</button>
          {manager && <button onClick={approve} disabled={!online || busy || !counted} className="btn-ink h-12">Setujui opname</button>}
        </div>
      )}
    </div>
  );
}
