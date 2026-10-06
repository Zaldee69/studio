"use client";

import { useEffect, useState } from "react";
import { useConfirm } from "@/components/alert-dialog";
import { useToast } from "@/components/ui";
import { createClient } from "@/lib/supabase/client";
import { BRAND } from "@/lib/brand";

type Enroll = { id: string; qr: string; secret: string };
const factorId = async () => (await createClient().auth.mfa.listFactors()).data?.totp[0]?.id ?? null;

/** Verifikasi 2 langkah (TOTP: Google Authenticator, 1Password, dsb.) untuk akun yang sedang masuk. */
export function MfaSettings() {
  const toast = useToast();
  const confirm = useConfirm();
  const [active, setActive] = useState<string | null | undefined>(undefined); // id faktor terverifikasi
  const [enroll, setEnroll] = useState<Enroll | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => factorId().then(setActive);
  useEffect(() => { factorId().then(setActive); }, []);

  async function start() {
    setBusy(true);
    const mfa = createClient().auth.mfa;
    // Sisa pendaftaran yang tidak selesai menghalangi pendaftaran baru → hapus dulu.
    const { data: all } = await mfa.listFactors();
    for (const f of all?.all ?? []) if (f.status !== "verified") await mfa.unenroll({ factorId: f.id });
    const { data, error } = await mfa.enroll({ factorType: "totp", friendlyName: `${BRAND} ${Date.now()}` });
    setBusy(false);
    if (error) return toast(error.message, "error");
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll) return;
    setBusy(true);
    const { error } = await createClient().auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(false);
    if (error) return toast("Kode salah — pakai kode terbaru di aplikasi.", "error");
    toast("Verifikasi 2 langkah aktif"); setEnroll(null); setCode(""); load();
  }
  async function disable() {
    if (!active || !(await confirm({ title: "Matikan verifikasi 2 langkah?", description: "Akun hanya akan dilindungi kata sandi.", confirmLabel: "Matikan", tone: "danger" }))) return;
    const { error } = await createClient().auth.mfa.unenroll({ factorId: active });
    if (error) return toast(error.message, "error");
    toast("Verifikasi 2 langkah dimatikan"); load();
  }

  return (
    <section aria-labelledby="mfa-h" className="max-w-xl space-y-4 rounded-2xl border border-line bg-card p-6">
      <h2 id="mfa-h" className="font-display text-xl font-bold">Verifikasi 2 langkah</h2>
      <p className="text-sm text-muted">
        Akun manajer bisa melihat semua keuangan dan mengatur akun tim. Dengan verifikasi 2 langkah, masuk butuh kata sandi
        <b> dan</b> kode 6 digit dari aplikasi autentikator di HP — sandi yang bocor saja tidak cukup.
      </p>
      {active === undefined ? <p className="text-sm text-muted">Memuat…</p> : active ? (
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className="rounded-full bg-[#D9F2E1] px-3 py-1 text-sm font-bold text-[#144D2A]">Aktif</span>
          <button onClick={disable} className="btn-ghost h-11">Matikan</button>
        </div>
      ) : enroll ? (
        <form onSubmit={verify} className="space-y-3">
          <p className="text-sm">1. Pindai kode QR ini dengan aplikasi autentikator (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI SVG dari Supabase */}
          <img src={enroll.qr} alt="Kode QR verifikasi 2 langkah" width={180} height={180} className="rounded-lg border border-line bg-white p-2" />
          <p className="text-xs text-muted">Tidak bisa memindai? Masukkan kunci manual: <code className="select-all break-all font-mono">{enroll.secret}</code></p>
          <label htmlFor="mfa-verify" className="label">2. Masukkan 6 digit kode dari aplikasi</label>
          <div className="flex gap-2">
            <input id="mfa-verify" value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input w-40" />
            <button disabled={busy || code.trim().length !== 6} className="btn-primary h-11">Aktifkan</button>
            <button type="button" onClick={() => setEnroll(null)} className="btn-ghost h-11">Batal</button>
          </div>
        </form>
      ) : (
        <button onClick={start} disabled={busy} className="btn-primary h-11">Aktifkan verifikasi 2 langkah</button>
      )}
    </section>
  );
}
