"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

/**
 * Lembar cetak (struk, rekap tutup kasir): dirender langsung di <body>, di luar tata letak aplikasi. Saat mencetak hanya
 * lembar ini yang tampil (globals.css) — panel aplikasi yang tingginya dibatasi layar / ber-scroll tidak ikut memotong
 * atau mengecilkannya. Di layar tidak terlihat.
 */
export function PrintSheet({ children, page }: { children: React.ReactNode; page?: string }) {
  const mounted = useSyncExternalStore(() => () => {}, () => true, () => false);
  if (!mounted) return null;
  return createPortal(
    <div className="print-sheet">
      {page && <style>{`@media print { @page { ${page} } }`}</style>}
      {children}
    </div>,
    document.body,
  );
}
