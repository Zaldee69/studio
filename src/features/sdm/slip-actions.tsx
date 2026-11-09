"use client";

import { DateInput } from "@/components/date-input";
import { Button, buttonClass } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
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
      <Button onClick={() => window.print()} variant="outline" className="h-11">Cetak / PDF</Button>
      <a href={`https://wa.me/?text=${encodeURIComponent(wa)}`} target="_blank" rel="noopener" className={buttonClass("plain", "h-11 rounded-[10px] bg-[#1F7A45] text-white")}>Kirim via WhatsApp</a>
      {closed && !paid && !open && <Button onClick={() => setOpen(true)} className="h-11">Tandai sudah dibayar</Button>}
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); markPaid(); }} className="flex w-full flex-wrap items-end gap-2 rounded-[14px] border border-line bg-card p-3">
          <label className="flex flex-col"><span className="mb-1 block text-xs font-semibold text-muted">Tanggal bayar</span><DateInput className="w-44" value={f.date} onChange={(e) => e.target.value && setF({ ...f, date: e.target.value })} /></label>
          <label className="flex flex-col"><span className="mb-1 block text-xs font-semibold text-muted">Metode</span>
            <NativeSelect className="w-36" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="transfer">Transfer</option><option value="tunai">Tunai</option></NativeSelect>
          </label>
          <label className="flex flex-1 flex-col"><span className="mb-1 block text-xs font-semibold text-muted">Catatan</span><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
          <Button disabled={!online} className="h-11">Simpan</Button>
        </form>
      )}
    </>
  );
}
