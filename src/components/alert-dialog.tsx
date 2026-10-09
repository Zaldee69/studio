"use client";

import * as AD from "@radix-ui/react-alert-dialog";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Konfirmasi gaya shadcn AlertDialog (Radix: fokus terkunci, Esc = batal, fokus kembali ke pemicu) pengganti
// window.confirm(). Pakai: `const confirm = useConfirm(); if (!(await confirm({ title: "Hapus baris ini?" }))) return;`
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
  // <dialog> modal (Sheet) berada di top layer browser — portal ke body akan tertutup & tak bisa diklik.
  // Saat ada dialog modal terbuka, render konfirmasi di dalamnya.
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false); // konfirmasi sebelumnya yang belum dijawab = batal
    resolver.current = resolve;
    const open = document.querySelectorAll<HTMLDialogElement>("dialog[open]");
    setContainer(open.length ? open[open.length - 1] : null);
    setOpts(o);
  }), []);
  const done = useCallback((ok: boolean) => { resolver.current?.(ok); resolver.current = null; setOpts(null); }, []);

  // Anggap batal bila (a) Sheet induk tertutup/hilang saat konfirmasi terbuka (mis. booking dipindah perangkat lain →
  // drawer menutup): konfirmasi ikut tersembunyi tapi Radix tetap mengunci body → halaman membeku; atau (b) pindah
  // halaman (tombol Back) → pertanyaan lama tak berlaku.
  // ponytail: polling 300 ms hanya selama konfirmasi terbuka; MutationObserver bila perlu lebih presisi.
  useEffect(() => {
    if (!opts) return;
    const path = location.pathname;
    const t = setInterval(() => {
      if (location.pathname !== path || (container && (!container.isConnected || !(container as HTMLDialogElement).open))) done(false);
    }, 300);
    return () => clearInterval(t);
  }, [opts, container, done]);

  return (
    <Ctx.Provider value={confirm}>
      {children}
      <AD.Root open={!!opts} onOpenChange={(o) => { if (!o) done(false); }}>
        <AD.Portal container={container ?? undefined}>
          <AD.Overlay className="fixed inset-0 z-[90] bg-ink/45" />
          <AD.Content className="fixed left-1/2 top-1/2 z-[91] flex w-[calc(100vw-32px)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-2xl bg-card p-6 text-ink shadow-[0_24px_64px_rgba(28,27,25,0.25)] focus:outline-none">
            <AD.Title className="font-display text-xl font-bold leading-snug">{opts?.title}</AD.Title>
            {opts?.description ? <AD.Description className="text-sm text-muted">{opts.description}</AD.Description>
              : <AD.Description className="sr-only">{opts?.title}</AD.Description>}
            <div className="flex flex-col-reverse gap-2 min-[420px]:flex-row min-[420px]:justify-end">
              <AD.Cancel className="btn-ghost h-11 rounded-[10px] px-4">{opts?.cancelLabel ?? "Batal"}</AD.Cancel>
              <AD.Action onClick={() => done(true)}
                className={`btn h-11 rounded-[10px] px-5 text-white ${opts?.tone === "danger" ? "bg-[#A12A2A] hover:bg-[#861F1F]" : "bg-ink hover:bg-[#353A33]"}`}>
                {opts?.confirmLabel ?? "Lanjutkan"}
              </AD.Action>
            </div>
          </AD.Content>
        </AD.Portal>
      </AD.Root>
    </Ctx.Provider>
  );
}
