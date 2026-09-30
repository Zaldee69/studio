"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CloseButton, Sheet, useOnline, useToast } from "@/components/ui";
import { formatRupiah, formatTanggal, formatJam } from "@/lib/domain/format";
import { serviceHpp, serviceMargin } from "@/lib/domain/commission";
import { formatUnitCost } from "@/lib/domain/inventory";
import { createClient } from "@/lib/supabase/client";
import { useInv } from "./provider";
import { qtyFmt } from "./types";

export type RecipeService = { id: string; name: string; category: string; price: number; active: boolean };
export type RecipeLine = { service_id: string; item_id: string; qty: number };
export type Margin = { id: string; name: string; price: number; hpp: number; margin_pct: number; commission: number; contribution: number };
type Change = { id: string; created_at: string; before: { name: string; qty: number; unit: string }[]; after: { name: string; qty: number; unit: string }[] };

export function RecipeTab({ services, lines, margins }: { services: RecipeService[]; lines: RecipeLine[]; margins: Margin[] }) {
  const { items, settings } = useInv();
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [sel, setSel] = useState(services.find((s) => s.active)?.id ?? "");
  const svc = services.find((s) => s.id === sel);
  const initial = () => lines.filter((l) => l.service_id === sel).map((l) => ({ item_id: l.item_id, qty: String(l.qty) }));
  const [draft, setDraft] = useState<{ for: string; rows: { item_id: string; qty: string }[] }>({ for: sel, rows: initial() });
  const rows = draft.for === sel ? draft.rows : initial();
  const setRows = (r: typeof rows) => setDraft({ for: sel, rows: r });
  const [history, setHistory] = useState<Change[] | null>(null);
  const consumables = items.filter((i) => i.kind === "consumable");
  const cost = (r: { item_id: string; qty: string }) => {
    const it = items.find((i) => i.item_id === r.item_id);
    return it ? Number(r.qty.replace(",", ".")) * it.unit_cost : 0;
  };
  const hpp = serviceHpp(rows.map((r) => ({ qty: Number(r.qty.replace(",", ".")) || 0, unitCost: items.find((i) => i.item_id === r.item_id)?.unit_cost ?? 0 })));
  const m = svc ? serviceMargin(svc.price, hpp, settings.ratio) : null;
  const margin = (id: string) => margins.find((x) => x.id === id);
  const valid = rows.every((r) => r.item_id && Number(r.qty.replace(",", ".")) > 0);

  async function save() {
    const { error } = await createClient().rpc("save_recipe", { p_service_id: sel, p_lines: rows.map((r) => ({ item_id: r.item_id, qty: Number(r.qty.replace(",", ".")) })) });
    if (error) return toast(error.message, "error");
    toast("Resep disimpan — berlaku untuk transaksi mulai sekarang"); router.refresh();
  }
  async function openHistory() {
    const { data } = await createClient().from("recipe_changes").select("id, created_at, before, after").eq("service_id", sel).order("created_at", { ascending: false }).limit(20);
    setHistory((data ?? []) as unknown as Change[]);
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 min-[1000px]:grid-cols-[280px_minmax(0,1fr)]">
        <nav aria-label="Layanan" className="flex max-h-[520px] flex-col gap-1 overflow-y-auto rounded-[14px] border border-line bg-card p-2">
          {services.map((s) => {
            const mg = margin(s.id);
            const warn = mg && mg.margin_pct < settings.marginWarn;
            return (
              <button key={s.id} onClick={() => setSel(s.id)} aria-current={s.id === sel ? "true" : undefined}
                className={`flex min-h-12 items-center gap-2 rounded-[10px] px-3 text-left text-sm ${s.id === sel ? "bg-ink text-white" : "hover:bg-paper"} ${s.active ? "" : "opacity-55"}`}>
                <span className="flex-1 font-semibold">{s.name}</span>
                {mg && <span className="tabular text-xs">{mg.margin_pct}%</span>}
                {warn && <span className="rounded-full bg-[#FFDADA] px-2 text-[11px] font-bold text-[#6E1616]">Margin rendah</span>}
              </button>
            );
          })}
        </nav>

        {svc && (
          <div className="grid min-w-0 gap-4 min-[1500px]:grid-cols-[1fr_300px]">
            <section className="flex flex-col gap-3 rounded-[14px] border border-line bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="flex-1 font-display text-xl font-bold">{svc.name}</h2>
                <button onClick={openHistory} className="btn-ghost h-11">Riwayat perubahan</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-sm tabular">
                  <thead><tr className="text-left text-xs text-muted"><th className="py-2 font-semibold">Bahan</th><th className="font-semibold">Jumlah pakai</th><th className="font-semibold">Satuan</th><th className="text-right font-semibold">Biaya</th><th /></tr></thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const it = items.find((x) => x.item_id === r.item_id);
                      return (
                        <tr key={i} className="border-t border-[#F0EDE6]">
                          <td className="py-1.5 pr-2">
                            <select aria-label={`Bahan baris ${i + 1}`} className="input" value={r.item_id} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, item_id: e.target.value } : x)))}>
                              <option value="">Pilih bahan…</option>
                              {consumables.map((c) => <option key={c.item_id} value={c.item_id}>{c.name} ({formatUnitCost(c.unit_cost)}/{c.unit})</option>)}
                            </select>
                          </td>
                          <td className="pr-2"><input aria-label={`Jumlah pakai baris ${i + 1}`} inputMode="decimal" className="input w-24" value={r.qty}
                            onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, qty: e.target.value } : x)))} /></td>
                          <td className="pr-2 text-muted">{it?.unit ?? "—"}</td>
                          <td className="pr-2 text-right">{formatRupiah(Math.round(cost(r)))}</td>
                          <td><button aria-label={`Hapus baris ${i + 1}`} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="btn-danger h-11 px-3">Hapus</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!rows.length && <p className="text-sm text-muted">Belum ada bahan — HPP layanan ini Rp0.</p>}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setRows([...rows, { item_id: "", qty: "" }])} className="btn-ghost h-11">+ Tambah bahan</button>
                <button disabled={!valid || !online} onClick={save} className="btn-ink ml-auto h-11">Simpan resep</button>
              </div>
              <p className="text-xs text-muted">Perubahan resep berlaku untuk transaksi mulai sekarang. HPP transaksi lama tetap (snapshot).</p>
            </section>

            {m && (
              <aside aria-label="Ringkasan margin" className="flex flex-col gap-2 self-start rounded-[14px] bg-ink p-5 text-paper tabular">
                {[["Harga layanan", formatRupiah(svc.price)], ["HPP bahan", formatRupiah(hpp)],
                  ["Margin kotor", `${formatRupiah(m.margin)} (${m.marginPct.toLocaleString("id-ID")}%)`], [`Komisi staf ${settings.ratio}%`, formatRupiah(m.commission)]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-sm"><span className="text-[#B9B3A7]">{k}</span><b>{v}</b></div>
                ))}
                <div className="mt-1 flex flex-col border-t border-[#3A3934] pt-2">
                  <span className="text-[13px] text-[#B9B3A7]">Laba kontribusi toko</span>
                  <b className="font-display text-[32px]">{formatRupiah(m.contribution)}</b>
                </div>
                {m.marginPct < settings.marginWarn && <span className="rounded-lg bg-[#FFDADA] px-2.5 py-1.5 text-xs font-bold text-[#6E1616]">Margin di bawah {settings.marginWarn}%</span>}
              </aside>
            )}
          </div>
        )}
      </div>

      <section className="flex flex-col gap-2 rounded-[14px] border border-line bg-card p-4">
        <h2 className="text-base font-bold">Margin semua layanan</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tabular">
            <thead><tr className="text-left text-xs text-muted">{["Layanan", "Harga", "HPP", "Margin", "Komisi", "Laba kontribusi"].map((h, i) => <th key={h} className={`py-2 font-semibold ${i ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
            <tbody>
              {[...margins].sort((a, b) => a.margin_pct - b.margin_pct).map((r) => (
                <tr key={r.id} className="border-t border-[#F0EDE6]">
                  <td className="py-2 font-semibold">{r.name}</td>
                  <td className="text-right">{formatRupiah(r.price)}</td>
                  <td className="text-right">{formatRupiah(r.hpp)}</td>
                  <td className={`text-right font-bold ${r.margin_pct < settings.marginWarn ? "text-[#A12A2A]" : ""}`}>{r.margin_pct.toLocaleString("id-ID")}%</td>
                  <td className="text-right">{formatRupiah(r.commission)}</td>
                  <td className="text-right">{formatRupiah(r.contribution)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Sheet open={history !== null} onClose={() => setHistory(null)} label="Riwayat resep" variant="drawer">
        <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
          <h2 className="flex-1 font-display text-xl font-bold">Riwayat resep · {svc?.name}</h2>
          <CloseButton onClick={() => setHistory(null)} />
        </div>
        <div className="flex flex-col gap-3 p-5">
          {!history?.length && <p className="text-sm text-muted">Belum ada perubahan tercatat.</p>}
          {history?.map((h) => (
            <div key={h.id} className="flex flex-col gap-1.5 rounded-[12px] border border-line p-3 text-sm">
              <b className="tabular">{formatTanggal(h.created_at)} {formatJam(h.created_at)}</b>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="font-semibold text-muted">Sebelum</span>{h.before.map((x) => <div key={x.name}>{x.name} {qtyFmt(x.qty)} {x.unit}</div>)}{!h.before.length && <div>—</div>}</div>
                <div><span className="font-semibold text-muted">Sesudah</span>{h.after.map((x) => <div key={x.name}>{x.name} {qtyFmt(x.qty)} {x.unit}</div>)}{!h.after.length && <div>—</div>}</div>
              </div>
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
