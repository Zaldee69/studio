"use client";

export function PrintButton({ label = "Cetak / PDF" }: { label?: string }) {
  return <button type="button" onClick={() => window.print()} className="btn-ink h-11">{label}</button>;
}
