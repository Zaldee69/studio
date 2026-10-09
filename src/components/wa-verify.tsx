"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { requestWaOtp, verifyWaOtp } from "@/app/akun/wa-actions";
import { normalizeWhatsApp } from "@/lib/domain/format";

/** Verifikasi nomor WhatsApp akun dengan kode OTP. Nomor yang pernah dipakai booking tamu → riwayat & saldo ikut tersambung. */
export function WaVerify({ initial = "", onDone }: { initial?: string; onDone?: (wa: string, merged: boolean) => void }) {
  const [wa, setWa] = useState(initial);
  const [sent, setSent] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function send() {
    if (!normalizeWhatsApp(wa)) return setMsg({ err: "Format nomor Indonesia, mis. 0812… atau +62812…" });
    setBusy(true); setMsg({});
    const r = await requestWaOtp(wa);
    setBusy(false);
    if (!r.ok) return setMsg({ err: r.message });
    setSent(r.whatsapp); setCode("");
    setMsg({ ok: `Kode 6 digit dikirim ke WhatsApp +${r.whatsapp}. Berlaku 10 menit.` });
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg({});
    const r = await verifyWaOtp(code);
    setBusy(false);
    if (!r.ok) return setMsg({ err: r.message });
    setMsg({ ok: r.merged ? "Nomor terverifikasi. Riwayat booking & saldo dengan nomor ini sudah tersambung ke akun Anda." : "Nomor WhatsApp terverifikasi." });
    onDone?.(r.whatsapp, !!r.merged);
    router.refresh(); // riwayat & saldo yang baru tersambung
  }

  return (
    <section aria-label="Verifikasi nomor WhatsApp" className="flex flex-col gap-3 rounded-2xl border border-rule-2 bg-lux-2 p-5">
      <span className="lux-label">Nomor WhatsApp</span>
      <p className="text-sm leading-relaxed text-sand">
        Verifikasi nomor WhatsApp untuk pengingat booking. Jika nomor ini pernah dipakai booking tanpa akun, riwayat &amp; saldo depositnya ikut tersambung.
      </p>
      {!sent ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-48 flex-1 flex-col gap-2">
            <span className="sr-only">No. WhatsApp</span>
            <input className="lux-input" inputMode="tel" autoComplete="tel" placeholder="0812…" value={wa} onChange={(e) => setWa(e.target.value)} aria-label="No. WhatsApp" />
          </label>
          <button type="button" onClick={send} disabled={busy} className="btn-line h-12">{busy ? "Mengirim…" : "Kirim kode"}</button>
        </div>
      ) : (
        <form onSubmit={verify} className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-40 flex-1 flex-col gap-2">
            <span className="sr-only">Kode verifikasi</span>
            <input className="lux-input tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} aria-label="Kode verifikasi" />
          </label>
          <button disabled={busy || code.length !== 6} className="btn-gold h-12">{busy ? "Memeriksa…" : "Verifikasi"}</button>
          <button type="button" onClick={() => { setSent(null); setMsg({}); }} className="py-2 text-[13px] text-dust underline">Ganti nomor / kirim ulang</button>
        </form>
      )}
      {msg.err && <p role="alert" className="text-sm text-[#9B2C22]">{msg.err}</p>}
      {msg.ok && <p role="status" className="text-sm text-[#2F6B45]">{msg.ok}</p>}
    </section>
  );
}
