"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOnline, useToast } from "@/components/ui";
import { jktDate } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";

export function SlipActions({ month, staffId, closed, paid, wa }: { month: string; staffId: string; closed: boolean; paid: boolean; wa: string }) {
  const toast = useToast(); const router = useRouter(); const online = useOnline();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: jktDate(), method: "transfer", note: "" });
  async function markPaid() {
    const { error } = await createClient().rpc("payroll_mark_paid", { p_month: `${month}-01`, p_staff_id: staffId, p_method: f.method,
      p_paid_at: `${f.date}T12:00:00+07:00`, p_note: f.note || undefined });
    if (error) return toast(error.message, "error");
    toast("Ditandai sudah dibayar"); setOpen(false); router.refresh();
  }
  return (
    <>
      <button onClick={() => window.print()} className="btn-ghost h-11">Cetak / PDF</button>
      <a href={`https://wa.me/?text=${encodeURIComponent(wa)}`} target="_blank" rel="noopener" className="btn h-11 rounded-[10px] bg-[#1F7A45] text-white">Kirim via WhatsApp</a>
      {closed && !paid && !open && <button onClick={() => setOpen(true)} className="btn-ink h-11">Tandai sudah dibayar</button>}
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); markPaid(); }} className="flex w-full flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-3">
          <label className="flex flex-col"><span className="label">Tanggal bayar</span><input type="date" className="input w-44" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} /></label>
          <label className="flex flex-col"><span className="label">Metode</span>
            <select className="input w-36" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="transfer">Transfer</option><option value="tunai">Tunai</option></select>
          </label>
          <label className="flex flex-1 flex-col"><span className="label">Catatan</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <button disabled={!online} className="btn-ink h-11">Simpan</button>
        </form>
      )}
    </>
  );
}
