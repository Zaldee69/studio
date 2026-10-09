"use client";

import { useState } from "react";
import { normalizeWhatsApp } from "@/lib/domain/format";
import { createClient } from "@/lib/supabase/client";
import { captchaOn, Turnstile } from "./turnstile";

export type Cust = { name: string; wa: string | null } | null;

/**
 * Masuk / daftar pelanggan dengan nomor WhatsApp + kode 6 digit (Supabase Auth phone OTP; kode dikirim lewat WhatsApp).
 * Tanpa email & kata sandi. Nomor yang pernah dipakai booking sebagai tamu → riwayat & saldo langsung tersambung (DB).
 * Dipakai di alur booking & /akun.
 */
export function CustomerAuth({ onDone }: { onDone: (c: NonNullable<Cust>) => void }) {
  const [step, setStep] = useState<"wa" | "code" | "name">("wa");
  const [wa, setWa] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // token captcha sekali pakai → render ulang widget tiap percobaan
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const phone = normalizeWhatsApp(wa);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!phone) return setErr("Nomor WhatsApp belum valid (mis. 0812… atau +62812…).");
    if (captchaOn() && !captcha) return setErr("Selesaikan verifikasi keamanan dulu.");
    setBusy(true); setErr(""); setInfo("");
    const { error } = await createClient().auth.signInWithOtp({ phone: `+${phone}`, options: { captchaToken: captcha ?? undefined } });
    setCaptcha(null); setAttempt((a) => a + 1); setBusy(false);
    if (error) return setErr(error.status === 429 ? "Terlalu sering meminta kode. Tunggu sebentar lalu coba lagi." : "Gagal mengirim kode. Periksa nomor lalu coba lagi.");
    setStep("code"); setCode("");
    setInfo(`Kode 6 digit dikirim ke WhatsApp +${phone}.`);
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr("");
    const supabase = createClient();
    // type "sms" = nama jenis kode login nomor HP di Supabase; kodenya dikirim lewat WhatsApp, bukan SMS
    const { error } = await supabase.auth.verifyOtp({ phone: `+${phone}`, token: code, type: "sms" });
    if (error) { setBusy(false); return setErr("Kode salah atau kedaluwarsa. Minta kode baru bila perlu."); }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: p } = user ? await supabase.from("profiles").select("role, full_name").eq("id", user.id).single() : { data: null };
    setBusy(false);
    if (p?.role !== "customer") {
      await supabase.auth.signOut();
      return setErr("Ini akun tim — silakan masuk lewat halaman login tim.");
    }
    // akun baru tanpa nama (nama = nomor) → tanya nama sekali
    if (!p.full_name || p.full_name === phone) return setStep("name");
    onDone({ name: p.full_name, wa: phone });
  }

  async function saveName(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return setErr("Isi nama Anda.");
    setBusy(true); setErr("");
    const { error } = await createClient().rpc("update_my_profile", { p_name: name.trim() });
    setBusy(false);
    if (error) return setErr(error.message);
    onDone({ name: name.trim(), wa: phone });
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5 pt-2">
      <span className="eyebrow">Akun pelanggan</span>
      <h1 className="-mt-2 font-serif text-[44px] font-normal leading-none">
        {step === "name" ? <>Satu langkah <i className="text-gold">lagi.</i></> : <>Masuk dengan <i className="text-gold">WhatsApp.</i></>}
      </h1>
      <span className="text-[15px] leading-relaxed text-sand">
        {step === "name" ? "Bagaimana kami memanggil Anda?"
          : "Tanpa email & kata sandi — cukup nomor WhatsApp. Lihat riwayat kunjungan, saldo deposit, dan jadwal ulang booking Anda."}
      </span>

      {step === "wa" && (
        <form onSubmit={send} className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="c-wa" className="lux-label">No. WhatsApp</label>
            <input id="c-wa" className="lux-input" type="tel" inputMode="tel" autoComplete="tel" placeholder="0812…" value={wa}
              onChange={(e) => { setWa(e.target.value); setErr(""); }} />
          </div>
          <span className="text-[13px] text-stone">Pernah booking tanpa akun dengan nomor ini? Riwayat &amp; saldo deposit Anda langsung tersambung.</span>
          <Turnstile key={attempt} onToken={setCaptcha} />
          <button disabled={busy} className="btn-gold w-full">{busy ? "Mengirim…" : "Kirim kode ke WhatsApp"}</button>
        </form>
      )}

      {step === "code" && (
        <form onSubmit={verify} className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="c-code" className="lux-label">Kode verifikasi</label>
            <input id="c-code" className="lux-input tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••"
              value={code} onChange={(e) => { setCode(e.target.value.replace(/\D/g, "")); setErr(""); }} autoFocus />
          </div>
          <button disabled={busy || code.length !== 6} className="btn-gold w-full">{busy ? "Memeriksa…" : "Masuk"}</button>
          <div className="flex flex-wrap gap-x-5">
            <button type="button" onClick={() => send()} disabled={busy} className="py-2 text-[13px] text-gold underline">Kirim ulang kode</button>
            <button type="button" onClick={() => { setStep("wa"); setInfo(""); setErr(""); }} className="py-2 text-[13px] text-dust underline">Ganti nomor</button>
          </div>
          <Turnstile key={attempt} onToken={setCaptcha} />
        </form>
      )}

      {step === "name" && (
        <form onSubmit={saveName} className="flex flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <label htmlFor="c-name" className="lux-label">Nama</label>
            <input id="c-name" className="lux-input" autoComplete="name" value={name} onChange={(e) => { setName(e.target.value); setErr(""); }} autoFocus />
          </div>
          <button disabled={busy} className="btn-gold w-full">{busy ? "Menyimpan…" : "Simpan & lanjut"}</button>
        </form>
      )}

      {err && <div role="alert" className="border border-[#E3B4AE] bg-[#FBEDEB] px-3.5 py-3 text-sm text-[#9B2C22]">{err}</div>}
      {info && !err && <div role="status" className="border border-gold/50 bg-lux-3 px-3.5 py-3 text-sm text-sand">{info}</div>}
    </div>
  );
}
