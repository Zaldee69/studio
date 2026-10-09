"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { STATUS, type ApptStatus } from "@/lib/domain/status";
import { Icon } from "./icons";

// ---------- Dialog (modal di tengah / laci kanan) — memakai <dialog> bawaan: fokus terkunci, Esc menutup ----------
export function Sheet({ open, onClose, label, variant = "modal", width = 600, children }: {
  open: boolean; onClose: () => void; label: string; variant?: "modal" | "drawer"; width?: number; children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const cls = variant === "drawer"
    ? "m-0 ml-auto h-dvh max-h-none w-full max-w-none border-l border-line bg-card p-0 shadow-[-12px_0_32px_rgba(28,27,25,0.10)] backdrop:bg-ink/30 min-[1000px]:w-[400px]"
    : "m-auto max-h-[calc(100dvh-32px)] w-[calc(100vw-32px)] rounded-2xl bg-card p-0 shadow-[0_24px_64px_rgba(28,27,25,0.25)] backdrop:bg-ink/45";
  return (
    <dialog ref={ref} aria-label={label} onClose={onClose} onCancel={(e) => { e.preventDefault(); if (!document.querySelector("[role=alertdialog]")) onClose(); /* Esc menutup konfirmasi dulu */ }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      className={cls} style={variant === "modal" ? { maxWidth: width } : undefined}>
      {open && children}
    </dialog>
  );
}

export function CloseButton({ onClick, label = "Tutup" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="flex size-11 shrink-0 items-center justify-center rounded-[10px] border border-line bg-card">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  );
}

// ---------- Toast ----------
type ToastAction = { label: string; href: string };
type Toast = { id: number; text: string; kind: "ok" | "error" | "info"; action?: ToastAction };
const ToastCtx = createContext<(text: string, kind?: Toast["kind"], action?: ToastAction) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast["kind"] = "ok", action?: ToastAction) => {
    const id = Date.now() + Math.random();
    setItems((t) => [...t.slice(-2), { id, text, kind, action }]);
    setTimeout(() => setItems((t) => t.filter((x) => x.id !== id)), action ? 12000 : kind === "error" ? 5000 : 2600);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-6 left-1/2 z-[60] flex -translate-x-1/2 flex-col items-center gap-2">
        {items.map((t) => (
          <div key={t.id} role={t.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex items-center gap-3 rounded-xl px-[18px] py-3 text-sm font-semibold shadow-[0_12px_32px_rgba(28,27,25,0.3)] ${t.kind === "error" ? "bg-[#6E1616] text-white" : t.kind === "info" ? "bg-[#1F7A45] text-white" : "bg-ink text-white"}`}>
            <span>{t.text}</span>
            {t.action && (
              <a href={t.action.href} className="flex min-h-10 items-center rounded-lg bg-white/15 px-3 text-[13px] font-bold hover:bg-white/25">{t.action.label}</a>
            )}
            {t.action && (
              <button onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))} aria-label="Tutup notifikasi" className="-mr-1 flex size-8 items-center justify-center rounded-lg hover:bg-white/15">✕</button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ---------- Online / offline ----------
const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => { window.removeEventListener("online", cb); window.removeEventListener("offline", cb); };
};
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="alert" className="sticky top-0 z-40 bg-[#6E1616] px-4 py-2.5 text-center text-sm font-semibold text-white">
      Koneksi terputus — perubahan akan dikirim saat tersambung. Tombol simpan &amp; bayar dinonaktifkan.
    </div>
  );
}

// ---------- Badge ----------
export function StatusBadge({ status, short = false }: { status: ApptStatus; short?: boolean }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex h-[26px] items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-bold" style={{ background: s.bg, color: s.fg }}>
      <span className="size-2 rounded-full" style={{ background: s.dot }} />{short ? s.short : s.label}
    </span>
  );
}

// chip kategori: latar abu netral + titik warna kategori (dot = warna grafik, palette.ts)
export const CAT_STYLE = {
  barbershop: { label: "Barbershop", short: "Barber", bg: "#F2F2EF", fg: "#2E312B", dot: "#5C6B4A" },
  nail: { label: "Nail Art", short: "Nail", bg: "#F2F2EF", fg: "#2E312B", dot: "#B05A63" },
  massage: { label: "Pijat", short: "Pijat", bg: "#F2F2EF", fg: "#2E312B", dot: "#9A6B3C" },
  retail: { label: "Ritel", short: "Ritel", bg: "#F2F2EF", fg: "#2E312B", dot: "#4F7A9A" },
} as const;

export function CatChip({ cat }: { cat: keyof typeof CAT_STYLE }) {
  const c = CAT_STYLE[cat];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-bold" style={{ background: c.bg, color: c.fg }}>
      <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: c.dot }} />{c.short}
    </span>
  );
}

export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-xs font-bold text-[#63665F]">{label}</label>
      {children}
      {hint && <span className="text-xs text-[#63665F]">{hint}</span>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-2 py-8 text-center text-[13px] text-[#63665F]">{children}</div>;
}

export { Icon };
