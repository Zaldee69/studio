"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { formatJam, formatTanggal } from "@/lib/domain/format";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

type N = { id: string; kind: string; payload: Record<string, unknown>; read_at: string | null; created_at: string };
const SCOPE: Record<string, string> = { consumable: "Bahan HPP", retail: "Barang ritel", all: "Semua" };
const qty = (v: unknown) => new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(Number(v));

function describe(n: N, base: string): { text: string; href: string } {
  const p = n.payload;
  if (n.kind === "unpaid_completed") return { text: `${p.customer} (${p.staff ?? "—"}) selesai dilayani sejak ${formatJam(String(p.since))} tapi belum dibayar`, href: `${base}/audit` };
  if (n.kind === "low_stock") return { text: `Stok ${p.name} tinggal ${qty(p.qty)} ${p.unit} (ambang ${qty(p.reorder_at)})`, href: `${base}/inventaris` };
  if (n.kind === "opname_pending") return { text: `Opname ${SCOPE[String(p.scope)] ?? ""} menunggu hitungan & persetujuan`, href: base === "/kasir" ? `/kasir/opname/${p.opname_id}` : `${base}/inventaris/opname/${p.opname_id}` };
  if (n.kind === "payroll_ready") return { text: "Slip gaji sudah final", href: "/kapster/komisi" };
  if (n.kind === "sop_reminder") return { text: "Checklist sterilisasi hari ini belum dimulai", href: base === "/manajer" ? "/manajer/sop" : "/kapster/sop" };
  if (n.kind === "maintenance_overdue") return { text: `${p.name} terlambat ${-Number(p.days_left)} hari`, href: "/manajer/sop#perawatan" };
  if (n.kind === "maintenance_due") return { text: Number(p.days_left) === 0 ? `${p.name} jatuh tempo hari ini` : `${p.name} jatuh tempo besok`, href: "/manajer/sop#perawatan" };
  return { text: n.kind, href: base };
}

/** Lonceng notifikasi (realtime). RLS: hanya notifikasi untuk peran/akun sendiri. */
export function NotificationBell({ base }: { base: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  // tutup saat klik/tap di luar panel atau tekan Esc
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  const { data, refresh } = useRealtimeTable(["notifications"], async () => {
    const { data } = await createClient().from("notifications").select("id, kind, payload, read_at, created_at").order("created_at", { ascending: false }).limit(20);
    return (data ?? []) as N[];
  });
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  async function read(ids: string[] | null) {
    await createClient().rpc("mark_notifications_read", ids ? { p_ids: ids } : {});
    refresh();
  }
  return (
    <div ref={box} className="relative">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Notifikasi${unread ? `, ${unread} belum dibaca` : ""}`}
        className="relative flex size-11 items-center justify-center rounded-[10px] text-ink hover:bg-card">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" /></svg>
        {unread > 0 && <span className="absolute right-1 top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#D23B3B] px-1 text-[11px] font-bold text-white tabular">{unread}</span>}
      </button>
      {open && (
        <div role="dialog" aria-label="Notifikasi" className="absolute right-0 top-full z-50 mt-2 flex w-[360px] max-w-[calc(100vw-120px)] flex-col rounded-[14px] border border-line bg-card text-ink shadow-[0_16px_40px_rgba(28,27,25,0.25)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <b className="flex-1">Notifikasi</b>
            {unread > 0 && <button onClick={() => read(null)} className="min-h-11 text-xs font-semibold text-accent underline">Tandai semua terbaca</button>}
          </div>
          <ul className="flex max-h-[60vh] flex-col overflow-y-auto">
            {!data?.length && <li className="px-4 py-5 text-sm text-muted">Belum ada notifikasi.</li>}
            {data?.map((n) => {
              const d = describe(n, base);
              return (
                <li key={n.id}>
                  <Link href={d.href} onClick={() => { setOpen(false); if (!n.read_at) read([n.id]); }}
                    className={`flex flex-col gap-0.5 border-b border-[#F0EDE6] px-4 py-3 text-sm hover:bg-paper ${n.read_at ? "text-muted" : "font-semibold"}`}>
                    <span>{!n.read_at && <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-[#D23B3B]" />}{d.text}</span>
                    <span className="text-xs font-normal text-muted tabular">{formatTanggal(n.created_at)} {formatJam(n.created_at)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Jumlah item di bawah ambang reorder (badge menu Inventaris, manajer). */
export function useStockAlerts(enabled: boolean) {
  const { data } = useRealtimeTable(["stock_moves"], async () => {
    if (!enabled) return 0;
    const { count } = await createClient().from("stock_levels").select("item_id", { count: "exact", head: true }).eq("status", "reorder").eq("active", true);
    return count ?? 0;
  });
  return data ?? 0;
}
