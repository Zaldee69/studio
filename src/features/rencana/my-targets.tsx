"use client";

import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useOnline, useToast } from "@/components/ui";
import { jktDate } from "@/lib/domain/format";
import { addDays } from "@/lib/domain/schedule";
import { useRealtimeTable } from "@/lib/hooks/useRealtimeTable";
import { createClient } from "@/lib/supabase/client";

type Cashier = { role: "cashier"; tx: number; tx_with_wa: number; customers: number; rebooked: number; target_wa_pct: number; target_rebook_pct: number };
type Staff = { role: "staff"; done: number; returning: number; target: number | null };
type Task = { id: string; title: string; due: string; measure: string; status: string; note: string };

const STATUS = [["belum", "Belum mulai"], ["jalan", "Sedang berjalan"], ["selesai", "Selesai"]] as const;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const shortDate = (d: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z"));

/** Kasir & capster: target pribadi (dihitung dari data, hanya angka sendiri) + tugas yang ditugaskan manajer. */
export function MyTargets() {
  const toast = useToast();
  const online = useOnline();
  const today = jktDate();
  const { data, refresh } = useRealtimeTable(["manager_tasks", "transactions", "appointments"], async () => {
    const supabase = createClient();
    const [{ data: t }, { data: tasks }] = await Promise.all([
      supabase.rpc("my_targets"),
      supabase.from("manager_tasks").select("id, title, due, measure, status, note").neq("status", "batal").order("due"),
    ]);
    return { t: t as Cashier | Staff | null, tasks: (tasks ?? []) as Task[] };
  });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  async function update(id: string, patch: Partial<Task>, msg: string) {
    const { error } = await createClient().from("manager_tasks").update(patch).eq("id", id);
    if (error) return toast(error.message, "error");
    toast(msg); setDrafts((d) => { const n = { ...d }; delete n[id]; return n; }); refresh();
  }

  if (!data) return null;
  const { t } = data;
  // tugas selesai lebih dari 7 hari lalu tidak ditampilkan lagi
  const tasks = data.tasks.filter((k) => k.status !== "selesai" || k.due >= addDays(today, -7));
  const metric = (label: string, value: string, sub: string, ok: boolean | null) => (
    <div className="flex flex-col rounded-[12px] bg-[#F5F5F1] px-3 py-2">
      <span className="text-xs text-muted">{label}</span>
      <b className={`tabular text-lg ${ok === true ? "text-[#1F7A45]" : ok === false ? "text-[#A12A2A]" : ""}`}>{value}</b>
      <span className="text-xs text-muted">{sub}</span>
    </div>
  );

  return (
    <section aria-label="Target dan tugas" className="flex flex-col gap-3 rounded-[16px] border border-line bg-card p-4">
      <h2 className="text-base font-bold">Target & tugas</h2>
      {t?.role === "cashier" && (
        <div className="grid grid-cols-2 gap-2">
          {metric("No. WA tercatat hari ini", `${pct(t.tx_with_wa, t.tx)}%`, `${t.tx_with_wa} dari ${t.tx} transaksi · target ${t.target_wa_pct}%`, t.tx ? pct(t.tx_with_wa, t.tx) >= t.target_wa_pct : null)}
          {metric("Dibookingkan jadwal berikutnya", `${pct(t.rebooked, t.customers)}%`, `${t.rebooked} dari ${t.customers} pelanggan · target ${t.target_rebook_pct}%`, t.customers ? pct(t.rebooked, t.customers) >= t.target_rebook_pct : null)}
        </div>
      )}
      {t?.role === "staff" && (
        <div className="grid grid-cols-2 gap-2">
          {metric("Layanan minggu ini", t.target ? `${t.done} dari ${t.target}` : String(t.done), t.target ? `${Math.max(0, t.target - t.done)} lagi ke target` : "tanpa target", t.target ? t.done >= t.target : null)}
          {metric("Pelanggan kembali ke Anda", String(t.returning), "minggu ini", null)}
        </div>
      )}
      {!tasks.length ? <p className="text-sm text-muted">Belum ada tugas dari manajer.</p> : tasks.map((k) => {
        const late = k.due < today && k.status !== "selesai";
        const draft = drafts[k.id] ?? k.note;
        return (
          <div key={k.id} className="flex flex-col gap-2 border-t border-[#EEEEEA] pt-3">
            <div className="flex flex-col gap-0.5">
              <span className={`text-xs font-bold tabular ${late ? "text-[#A12A2A]" : "text-muted"}`}>{shortDate(k.due)}{late ? " · lewat tenggat" : ""}</span>
              <b className="text-sm">{k.title}</b>
              {k.measure && <span className="text-xs text-muted">Berhasil bila: {k.measure}</span>}
            </div>
            <div className="flex flex-wrap gap-2">
              <NativeSelect aria-label={`Status ${k.title}`} className="w-auto" value={k.status} disabled={!online}
                onChange={(e) => update(k.id, { status: e.target.value }, "Status disimpan")}>
                {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </NativeSelect>
              <Textarea aria-label={`Catatan ${k.title}`} rows={1} className="min-h-11 min-w-0 flex-1 py-2.5 text-sm" placeholder="Catatan, mis. sudah minta ulasan ke 5 pelanggan"
                value={draft} onChange={(e) => setDrafts({ ...drafts, [k.id]: e.target.value })} />
              <Button variant="outline" disabled={!online || draft === k.note} onClick={() => update(k.id, { note: draft }, "Catatan disimpan")}>Simpan</Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}
