"use client";

import { useState } from "react";
import { CMD, Escpos } from "@/lib/domain/escpos";
import { connectPrinter, disconnectPrinter, printBytes, setPrinterSettings, usePrinter } from "@/lib/printer";
import { CloseButton, Sheet, useToast } from "./ui";

/** Status printer struk + pengaturan per perangkat (kertas, cetak otomatis, laci, uji cetak). */
export function PrinterButton() {
  const p = usePrinter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const on = p.status === "on";

  async function send(bytes: Uint8Array, ok: string) {
    setBusy(true);
    try { await printBytes(bytes); toast(ok); } catch (e) { toast(e instanceof Error ? e.message : String(e), "error"); }
    setBusy(false);
  }
  const test = () => {
    const e = new Escpos(p.settings.paper === 80 ? 48 : 32);
    e.big("UJI CETAK").cmd(CMD.center).line(`Kertas ${p.settings.paper} mm`).line("1234567890".repeat(5).slice(0, e.cols)).cmd(CMD.left)
      .rule().lr("Kiri", "Kanan").rule("=");
    return send(e.end(), "Uji cetak terkirim");
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Printer struk: ${on ? `tersambung (${p.name})` : p.status === "connecting" ? "menyambung" : "belum tersambung"}`}
        className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full border px-4 text-[13px] font-bold ${on ? "border-[#BFE5CC] bg-[#EAF7EF] text-[#144D2A]" : "border-[#D9D4C8] bg-card text-muted"}`}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9V3h12v6M6 18H4a1 1 0 0 1-1-1v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a1 1 0 0 1-1 1h-2M6 14h12v7H6z" /></svg>
        <span className={`size-2 rounded-full ${on ? "bg-[#1F7A45]" : p.status === "connecting" ? "bg-[#C9A45C]" : "bg-[#B9B3A7]"}`} />
        <span className="max-[480px]:hidden">{p.status === "connecting" ? "Menyambung…" : "Printer"}</span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} label="Printer struk" width={460}>
        <div className="flex flex-col gap-4 p-5">
          <div className="flex items-center gap-3">
            <h2 className="flex-1 font-display text-xl font-bold">Printer struk</h2>
            <CloseButton onClick={() => setOpen(false)} />
          </div>
          {p.status === "unsupported" ? (
            <p role="alert" className="rounded-[10px] bg-[#FFF1C2] px-3.5 py-3 text-sm text-[#5A4300]">
              Browser ini tidak mendukung printer Bluetooth. Pakai <b>Chrome</b> di Android atau laptop, dan buka aplikasi lewat <b>https</b>.
            </p>
          ) : (
            <div className="flex items-center gap-3 rounded-[10px] border border-line p-3">
              <span className={`size-2.5 shrink-0 rounded-full ${on ? "bg-[#1F7A45]" : "bg-[#B9B3A7]"}`} />
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <b className="truncate">{on ? p.name : p.status === "connecting" ? `Menyambung ke ${p.name}…` : "Belum tersambung"}</b>
                <span className="text-xs text-muted">Bluetooth · tersimpan di perangkat ini</span>
              </span>
              {on ? <button type="button" onClick={disconnectPrinter} className="btn-ghost h-10 rounded-[10px] px-3 text-sm">Putuskan</button>
                : <button type="button" onClick={connectPrinter} disabled={p.status === "connecting"} className="btn-ink h-10 rounded-[10px] px-4 text-sm">Sambungkan</button>}
            </div>
          )}
          {p.error && <p role="alert" className="text-sm text-danger">{p.error}</p>}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-xs font-bold text-muted">Lebar kertas</legend>
            <div className="grid grid-cols-2 gap-2">
              {([58, 80] as const).map((w) => (
                <label key={w} className={`flex h-11 cursor-pointer items-center justify-center rounded-[10px] border text-sm font-bold ${p.settings.paper === w ? "border-ink bg-ink text-white" : "border-line"}`}>
                  <input type="radio" name="paper" className="sr-only" checked={p.settings.paper === w} onChange={() => setPrinterSettings({ paper: w })} />{w} mm
                </label>
              ))}
            </div>
          </fieldset>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-[#1c1b19]" checked={p.settings.autoPrint} onChange={(e) => setPrinterSettings({ autoPrint: e.target.checked })} />
            <span><b>Cetak struk otomatis</b><span className="block text-xs text-muted">Langsung tercetak setelah pembayaran dicatat.</span></span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" className="mt-0.5 size-5 accent-[#1c1b19]" checked={p.settings.drawer} onChange={(e) => setPrinterSettings({ drawer: e.target.checked })} />
            <span><b>Buka laci uang saat bayar tunai</b><span className="block text-xs text-muted">Laci harus tersambung ke port laci (RJ11) printer. Kebanyakan printer Bluetooth 58 mm tidak punya port ini.</span></span>
          </label>

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={test} disabled={!on || busy} className="btn-ghost h-11 rounded-[10px]">Uji cetak</button>
            <button type="button" onClick={() => send(Uint8Array.from([...CMD.init, ...CMD.drawer]), "Perintah buka laci terkirim")} disabled={!on || busy || !p.settings.drawer}
              className="btn-ghost h-11 rounded-[10px]">Buka laci</button>
          </div>
        </div>
      </Sheet>
    </>
  );
}
