"use client";

/** Simpan sebagai PDF lewat dialog cetak browser; judul halaman = nama file PDF. */
export function PrintButton({ filename }: { filename: string }) {
  return (
    <button onClick={() => { const t = document.title; document.title = filename; window.print(); document.title = t; }} className="btn-primary h-11">
      Simpan PDF
    </button>
  );
}
