"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui";
import type { Decision, Issue, OwnerNotes, Priority } from "@/features/analitik/owner";
import { createClient } from "@/lib/supabase/client";

const ISSUE: [keyof Issue, string][] = [["masalah", "Masalah"], ["bukti", "Bukti / data"], ["dampak", "Dampak"], ["akar", "Akar penyebab / hipotesis"],
  ["tindakan", "Tindakan & cara mengukur hasil"], ["pj", "Penanggung jawab"], ["tenggat", "Tenggat"]];
const DECISION: [keyof Decision, string][] = [["keputusan", "Keputusan yang dibutuhkan"], ["alasan", "Alasan & bukti"], ["opsi", "Opsi"],
  ["rekomendasi", "Rekomendasi manajer"], ["biaya", "Estimasi biaya / dampak"], ["risiko", "Risiko bila ditunda"], ["tenggat", "Tenggat keputusan"]];
const PRIORITY: [keyof Priority, string][] = [["tujuan", "Tujuan"], ["tindakan", "Tindakan konkret"], ["indikator", "Indikator keberhasilan"],
  ["pj", "Penanggung jawab"], ["tenggat", "Tenggat"]];
const blank = <T,>(fields: [keyof T, string][]) => Object.fromEntries(fields.map(([k]) => [k, ""])) as T;

/** Rows editor: satu kartu per baris, kolom sesuai template laporan. */
function Rows<T extends Record<string, string>>({ title, fields, rows, max, onChange, hint }: {
  title: string; fields: [keyof T, string][]; rows: T[]; max: number; onChange: (r: T[]) => void; hint?: string;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-bold">{title} <span className="font-normal text-muted">(maks. {max})</span></legend>
      {hint && <p className="text-xs text-muted">{hint}</p>}
      {rows.map((r, i) => (
        <div key={i} className="grid gap-2 rounded-[10px] border border-line p-3 min-[700px]:grid-cols-2">
          {fields.map(([k, label]) => (
            <label key={String(k)} className="flex flex-col gap-1 text-xs font-semibold text-muted">{label}
              <textarea rows={1} className="input min-h-10 py-2 text-sm font-normal text-ink" value={r[k]}
                onChange={(e) => onChange(rows.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />
            </label>
          ))}
          <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} className="self-end justify-self-start text-xs font-semibold text-[#A12A2A] underline">Hapus baris</button>
        </div>
      ))}
      {rows.length < max && <button type="button" onClick={() => onChange([...rows, blank(fields)])} className="btn-ghost h-10 self-start rounded-[10px] px-3 text-sm">+ Tambah</button>}
    </fieldset>
  );
}

/** Isian manajer untuk laporan (tidak ikut tercetak): ringkasan, masalah & tindakan, keputusan owner, prioritas. */
export function NotesEditor({ kind, periodStart, initial, suggestions }: {
  kind: "minggu" | "bulan"; periodStart: string; initial: OwnerNotes | null; suggestions: string[];
}) {
  const toast = useToast(); const router = useRouter();
  const [n, setN] = useState<OwnerNotes>(initial ?? {});
  const [open, setOpen] = useState(!initial);
  const [saving, setSaving] = useState(false);
  const set = (p: Partial<OwnerNotes>) => setN({ ...n, ...p });

  async function save() {
    setSaving(true);
    const { error } = await createClient().from("owner_report_notes")
      .upsert({ kind, period_start: periodStart, data: n as never, updated_at: new Date().toISOString() });
    setSaving(false);
    if (error) return toast(error.message, "error");
    toast("Catatan laporan disimpan"); router.refresh();
  }

  return (
    <section aria-label="Catatan manajer" className="mx-auto flex w-full max-w-[210mm] flex-col gap-4 rounded-[14px] border border-line bg-card p-5 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="flex-1 font-display text-lg font-bold">Catatan manajer <span className="text-sm font-normal text-muted">— bagian A, G, H, I laporan (tidak tercetak di sini, tampil di laporan)</span></h2>
        <button type="button" onClick={() => setOpen(!open)} className="btn-ghost h-10 rounded-[10px] px-3 text-sm">{open ? "Tutup" : "Isi / ubah catatan"}</button>
      </div>
      {open && <>
        <label className="flex flex-col gap-1 text-sm font-bold">A. Ringkasan eksekutif
          <span className="text-xs font-normal text-muted">Satu paragraf: kondisi bisnis, pencapaian terpenting, masalah/risiko terbesar, prioritas berikutnya. Jangan ulang angka di tabel.</span>
          <textarea rows={4} className="input py-2 text-sm font-normal" value={n.summary ?? ""} onChange={(e) => set({ summary: e.target.value })} />
        </label>
        {suggestions.length > 0 && (
          <div className="flex flex-col gap-1 rounded-[10px] bg-paper p-3 text-xs">
            <b>Temuan otomatis (cek dulu sebelum dipakai):</b>
            {suggestions.map((s) => (
              <span key={s} className="flex items-start gap-2">
                <span className="flex-1">{s}</span>
                <button type="button" disabled={(n.issues ?? []).length >= 5} className="shrink-0 font-semibold underline"
                  onClick={() => set({ issues: [...(n.issues ?? []), { ...blank<Issue>(ISSUE), masalah: s, bukti: "Analitik sistem" }] })}>Jadikan masalah</button>
              </span>
            ))}
          </div>
        )}
        <Rows<Issue> title="G. Masalah utama & tindakan korektif" fields={ISSUE} rows={n.issues ?? []} max={5} onChange={(issues) => set({ issues })} />
        <Rows<Decision> title="H. Keputusan yang dibutuhkan dari owner" fields={DECISION} rows={n.decisions ?? []} max={5}
          hint="Hanya hal di luar wewenang manajer (harga, struktur gaji/komisi, pengeluaran di luar anggaran, investasi, perekrutan sesuai kesepakatan)."
          onChange={(decisions) => set({ decisions, no_decision: decisions.length ? false : n.no_decision })} />
        {!(n.decisions ?? []).length && (
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4" checked={!!n.no_decision} onChange={(e) => set({ no_decision: e.target.checked })} />
            Tidak ada keputusan owner yang mendesak</label>
        )}
        <Rows<Priority> title={`I. Prioritas ${kind === "minggu" ? "minggu" : "bulan"} berikutnya`} fields={PRIORITY} rows={n.priorities ?? []} max={3} onChange={(priorities) => set({ priorities })} />
        {kind === "bulan" && <>
          <label className="flex flex-col gap-1 text-sm font-bold">Evaluasi tindakan bulan sebelumnya
            <textarea rows={3} className="input py-2 text-sm font-normal" value={n.evaluation ?? ""} onChange={(e) => set({ evaluation: e.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-bold">Rencana & target bulan berikutnya
            <textarea rows={3} className="input py-2 text-sm font-normal" value={n.next_plan ?? ""} onChange={(e) => set({ next_plan: e.target.value })} />
          </label>
        </>}
        <button type="button" onClick={save} disabled={saving} className="btn-ink h-12 self-end rounded-[10px] px-6">{saving ? "Menyimpan…" : "Simpan catatan"}</button>
      </>}
    </section>
  );
}
