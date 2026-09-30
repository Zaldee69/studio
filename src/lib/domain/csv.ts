// Impor pelanggan: parse CSV + pratinjau. Server (import_customers) tetap memvalidasi ulang.
import { normalizeWhatsApp } from "./format";

/** CSV sederhana: pemisah , atau ; (otomatis), tanda kutip ganda, BOM. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export type ImportRow = { row: number; name: string; whatsapp: string; notes: string; wa: string | null; status: "valid" | "duplicate" | "error"; reason?: string };

const col = (header: string[], ...names: string[]) => header.findIndex((h) => names.includes(h.trim().toLowerCase()));

/** Baris pertama = header (nama, whatsapp/wa/no wa, catatan/notes). */
export function previewImport(rows: string[][], existingWa: Set<string>): ImportRow[] {
  const [header = [], ...body] = rows;
  const iName = col(header, "nama", "name"), iWa = col(header, "whatsapp", "wa", "no wa", "no. wa", "no. whatsapp", "hp"),
    iNotes = col(header, "catatan", "notes", "preferensi");
  const seen = new Set<string>();
  return body.map((r, k) => {
    const name = (r[iName] ?? "").trim(), whatsapp = (r[iWa] ?? "").trim(), notes = (r[iNotes] ?? "").trim();
    const wa = whatsapp ? normalizeWhatsApp(whatsapp) : null;
    const base = { row: k + 2, name, whatsapp, notes, wa };
    if (iName < 0) return { ...base, status: "error" as const, reason: "Kolom 'nama' tidak ditemukan" };
    if (!name) return { ...base, status: "error" as const, reason: "Nama kosong" };
    if (whatsapp && !wa) return { ...base, status: "error" as const, reason: "No. WhatsApp tidak valid" };
    if (wa && (existingWa.has(wa) || seen.has(wa))) return { ...base, status: "duplicate" as const, reason: "No. WA sudah terdaftar" };
    if (wa) seen.add(wa);
    return { ...base, status: "valid" as const };
  });
}

export const TEMPLATE_CSV = "nama,whatsapp,catatan\nBudi Santoso,081234567890,Clipper #2 samping\nRina Wati,0813-9876-5432,Gel warna nude\n";

/** Ekspor CSV untuk Excel (Indonesia): BOM UTF-8, pemisah ";", sel dikutip bila perlu. Bisa dibaca ulang parseCsv(). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n") + "\r\n";
}

/** Unduh teks sebagai file (klien). */
export function downloadText(filename: string, text: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
