"use client";

import { Button } from "@/components/ui/button";
/** Simpan sebagai PDF lewat dialog cetak browser; judul halaman = nama file PDF. */
export function PrintButton({ filename }: { filename: string }) {
  return (
    <Button onClick={() => { const t = document.title; document.title = filename; window.print(); document.title = t; }} variant="brand" className="h-11">
      Simpan PDF
    </Button>
  );
}
