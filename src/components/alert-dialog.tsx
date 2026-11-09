"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Konfirmasi shadcn AlertDialog (Radix: fokus terkunci, Esc = batal, fokus kembali ke pemicu) pengganti
// window.confirm(). Pakai: `const confirm = useConfirm(); if (!(await confirm({ title: "Hapus baris ini?" }))) return;`
// Sejak migrasi shadcn (10 Nov) modal Sheet juga Radix, jadi konfirmasi cukup di-portal ke body (tumpukan lapisan Radix).
export type ConfirmOptions = {
  title: string;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" = tindakan merusak/tak bisa diulang (tombol merah) */
  tone?: "default" | "danger";
};

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(Ctx);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false); // konfirmasi sebelumnya yang belum dijawab = batal
    resolver.current = resolve;
    setOpts(o);
  }), []);
  const done = useCallback((ok: boolean) => { resolver.current?.(ok); resolver.current = null; setOpts(null); }, []);

  // Pindah halaman (tombol Back) saat konfirmasi terbuka → pertanyaan lama tak berlaku, anggap batal.
  // ponytail: polling 300 ms hanya selama konfirmasi terbuka.
  useEffect(() => {
    if (!opts) return;
    const path = location.pathname;
    const t = setInterval(() => { if (location.pathname !== path) done(false); }, 300);
    return () => clearInterval(t);
  }, [opts, done]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AlertDialog open={!!opts} onOpenChange={(o) => { if (!o) done(false); }}>
        <AlertDialogContent className="flex w-[calc(100vw-32px)] max-w-[440px] flex-col gap-4 rounded-2xl bg-card p-6 text-ink shadow-[0_24px_64px_rgba(28,27,25,0.25)] ring-0 sm:max-w-[440px]">
          <AlertDialogTitle className="font-display text-xl font-bold leading-snug">{opts?.title}</AlertDialogTitle>
          {opts?.description ? <AlertDialogDescription className="text-sm text-muted">{opts.description}</AlertDialogDescription>
            : <AlertDialogDescription className="sr-only">{opts?.title}</AlertDialogDescription>}
          <div className="flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:justify-end">
            <AlertDialogCancel variant="outline">{opts?.cancelLabel ?? "Batal"}</AlertDialogCancel>
            <AlertDialogAction variant="plain" onClick={() => done(true)}
              className={`px-5 text-white ${opts?.tone === "danger" ? "bg-[#A12A2A] hover:bg-[#861F1F]" : "bg-ink hover:bg-[#353A33]"}`}>
              {opts?.confirmLabel ?? "Lanjutkan"}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}
