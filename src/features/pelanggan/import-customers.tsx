"use client";

import { useState } from "react";
import { CloseButton, useToast } from "@/components/ui";
import { parseCsv, previewImport, TEMPLATE_CSV, type ImportRow } from "@/lib/domain/csv";
import { createClient } from "@/lib/supabase/client";

const STATUS_STYLE = { valid: ["Valid", "#D9F2E1", "#144D2A"], duplicate: ["Duplikat", "#FFF1C2", "#5A4300"], error: ["Error", "#FFDADA", "#6E1616"] } as const;

/** Impor pelanggan lama dari CSV/Excel: pratinjau (valid / duplikat / error) → konfirmasi → simpan. */
export function ImportCustomers({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(""); setRows(null); setFileName(f.name);
    try {
      let table: string[][];
      if (/\.xlsx$/i.test(f.name)) {
        const { readSheet } = await import("read-excel-file/browser");
        table = (await readSheet(f)).map((r) => r.map((c) => (c == null ? "" : String(c))));
      } else table = parseCsv(await f.text());
      // cek duplikat ke data yang sudah ada (per 200 nomor)
      const draft = previewImport(table, new Set());
      const was = [...new Set(draft.map((r) => r.wa).filter((w): w is string => !!w))];
      const existing = new Set<string>();
      for (let i = 0; i < was.length; i += 200) {
        const { data } = await createClient().from("customers").select("whatsapp").in("whatsapp", was.slice(i, i + 200));
        (data ?? []).forEach((d) => d.whatsapp && existing.add(d.whatsapp));
      }
      setRows(previewImport(table, existing));
    } catch {
      setError("File tidak bisa dibaca. Pakai .csv atau .xlsx dengan kolom nama, whatsapp, catatan.");
    }
  }

  const valid = rows?.filter((r) => r.status === "valid") ?? [];
  const count = (s: ImportRow["status"]) => rows?.filter((r) => r.status === s).length ?? 0;

  async function confirmImport() {
    setSaving(true);
    let inserted = 0, dup = 0, errs = 0;
    for (let i = 0; i < valid.length; i += 500) {
      const { data, error } = await createClient().rpc("import_customers", {
        p_rows: valid.slice(i, i + 500).map((r) => ({ name: r.name, whatsapp: r.wa, notes: r.notes })),
      });
      if (error) { setSaving(false); return setError(error.message); }
      const d = data as { inserted: number; duplicates: number; errors: unknown[] };
      inserted += d.inserted; dup += d.duplicates; errs += d.errors.length;
    }
    setSaving(false);
    toast(`${inserted} pelanggan diimpor${dup ? ` · ${dup} duplikat dilewati` : ""}${errs ? ` · ${errs} error` : ""}`);
    onDone();
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-start gap-3">
        <div className="flex flex-1 flex-col gap-1">
          <h2 className="font-display text-2xl font-bold">Impor pelanggan lama</h2>
          <span className="text-[13px] text-muted">CSV atau Excel (.xlsx) dengan kolom <b>nama</b>, <b>whatsapp</b>, <b>catatan</b>. No. WA dinormalisasi ke 62….</span>
        </div>
        <CloseButton onClick={onClose} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="btn-ink h-11 cursor-pointer">
          Pilih file…
          <input type="file" accept=".csv,.xlsx,text/csv" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        {fileName && <span className="text-[13px] text-muted">{fileName}</span>}
        <a href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE_CSV)}`} download="template-pelanggan.csv"
          className="ml-auto text-[13px] font-bold text-accent underline">Unduh contoh file</a>
      </div>
      {error && <p role="alert" className="text-[13px] font-semibold text-[#A12A2A]">{error}</p>}
      {rows && (
        <>
          <div className="flex flex-wrap gap-2 text-[13px] font-bold">
            {(["valid", "duplicate", "error"] as const).map((s) => (
              <span key={s} className="rounded-full px-3 py-1" style={{ background: STATUS_STYLE[s][1], color: STATUS_STYLE[s][2] }}>{STATUS_STYLE[s][0]} {count(s)}</span>
            ))}
          </div>
          <div className="max-h-[45dvh] overflow-auto rounded-xl border border-line">
            <table className="w-full text-left text-[13px] tabular">
              <thead className="sticky top-0 bg-paper text-xs text-muted">
                <tr><th className="px-3 py-2">Baris</th><th className="px-3 py-2">Nama</th><th className="px-3 py-2">WhatsApp</th><th className="px-3 py-2">Status</th></tr>
              </thead>
              <tbody>
                {rows.slice(0, 300).map((r) => (
                  <tr key={r.row} className="border-t border-[#F0EDE6]">
                    <td className="px-3 py-2 text-muted">{r.row}</td>
                    <td className="px-3 py-2 font-semibold">{r.name || "—"}</td>
                    <td className="px-3 py-2">{r.wa ?? r.whatsapp}</td>
                    <td className="px-3 py-2"><span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: STATUS_STYLE[r.status][1], color: STATUS_STYLE[r.status][2] }}>{STATUS_STYLE[r.status][0]}</span>
                      {r.reason && <span className="ml-2 text-xs text-muted">{r.reason}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 300 && <p className="px-3 py-2 text-xs text-muted">…dan {rows.length - 300} baris lagi.</p>}
          </div>
          <div className="flex justify-end gap-2.5">
            <button onClick={onClose} className="btn-ghost h-12 rounded-[10px]">Batal</button>
            <button onClick={confirmImport} disabled={!valid.length || saving} className="btn-ink h-12 px-6">
              {saving ? "Mengimpor…" : `Impor ${valid.length} pelanggan`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
