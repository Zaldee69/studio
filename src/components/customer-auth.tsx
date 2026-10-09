"use client";

import { useState } from "react";
import { passwordError, PASSWORD_HINT } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";
import { captchaOn, Turnstile } from "./turnstile";

export type Cust = { name: string; wa: string | null } | null;

/** Masuk / daftar pelanggan (email + sandi) di sisi klien — dipakai di alur booking & /akun. */
export function CustomerAuth({ onDone }: { onDone: (c: NonNullable<Cust>) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "forgot">("login");
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // token captcha sekali pakai → render ulang widget tiap percobaan
  const [f, setF] = useState({ name: "", email: "", pw: "", pw2: "" });
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setErr(""); };

  async function finish() {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: p } = user ? await supabase.from("profiles").select("role, full_name, customer_id").eq("id", user.id).single() : { data: null };
    if (p?.role !== "customer") {
      await supabase.auth.signOut();
      return setErr("Ini akun tim — silakan masuk lewat halaman login tim.");
    }
    const { data: c } = await supabase.from("my_customer").select("whatsapp").maybeSingle();
    onDone({ name: p.full_name, wa: c?.whatsapp ?? null });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const email = f.email.trim().toLowerCase();
    if (mode === "register") {
      if (!f.name.trim()) return setErr("Isi nama lengkap.");
      if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Email belum valid.");
      const weak = passwordError(f.pw);
      if (weak) return setErr(weak);
      if (f.pw !== f.pw2) return setErr("Kedua kata sandi tidak sama.");
    }
    if (captchaOn() && !captcha) return setErr("Selesaikan verifikasi keamanan dulu.");
    setBusy(true);
    const supabase = createClient();
    const captchaToken = captcha ?? undefined; // divalidasi Supabase Auth bila captcha diaktifkan di proyek
    setCaptcha(null); setAttempt((a) => a + 1);
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/akun/sandi-baru`, captchaToken });
      setBusy(false);
      if (error) return setErr("Gagal mengirim email. Coba lagi sebentar lagi.");
      return setInfo("Jika email terdaftar, tautan untuk membuat kata sandi baru sudah kami kirim. Cek kotak masuk / spam.");
    }
    const res = mode === "login"
      ? await supabase.auth.signInWithPassword({ email, password: f.pw, options: { captchaToken } })
      : await supabase.auth.signUp({ email, password: f.pw, options: {
        data: { full_name: f.name.trim() }, captchaToken, emailRedirectTo: `${location.origin}/auth/konfirmasi` } });
    if (res.error) {
      setBusy(false);
      const e = res.error;
      return setErr(e.status === 429 ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
        : mode === "login" ? (e.code === "email_not_confirmed" ? "Email belum dikonfirmasi — klik tautan di email pendaftaran Anda." : "Email atau kata sandi salah.")
        : e.code === "weak_password" ? `Kata sandi terlalu lemah. ${PASSWORD_HINT}`
        : "Pendaftaran gagal. Jika email ini sudah terdaftar, silakan masuk atau pakai Lupa kata sandi.");
    }
    if (!res.data.session) {
      setBusy(false);
      return setInfo(`Kami mengirim tautan konfirmasi ke ${email}. Klik tautannya untuk mengaktifkan akun.`);
    }
    await finish();
    setBusy(false);
  }

  const field = (id: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <div className="flex min-w-0 flex-col gap-2">
      <label htmlFor={id} className="lux-label">{label}</label>
      <input id={id} className="lux-input" {...props} />
    </div>
  );

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5 pt-2">
      <span className="eyebrow">Akun pelanggan</span>
      <h1 className="-mt-2 font-serif text-[44px] font-normal leading-none">
        {mode === "login" ? <>Selamat <i className="text-gold">datang.</i></> : mode === "forgot" ? <>Lupa <i className="text-gold">kata sandi.</i></> : <>Buat <i className="text-gold">akun.</i></>}
      </h1>
      <span className="text-[15px] font-light leading-relaxed text-sand">
        Booking lebih cepat, lihat riwayat kunjungan, dan saldo deposit Anda.
      </span>
      <div role="tablist" aria-label="Masuk atau daftar" className="grid grid-cols-2 border border-rule-2">
        {(["login", "register"] as const).map((m) => (
          <button key={m} role="tab" aria-selected={mode === m || (m === "login" && mode === "forgot")} onClick={() => { setMode(m); setErr(""); setInfo(""); }}
            className={`h-11 text-xs font-medium uppercase tracking-[0.22em] ${mode === m ? "bg-gold text-lux" : "text-dust hover:text-cream"}`}>
            {m === "login" ? "Masuk" : "Daftar"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {mode === "register" && field("c-name", "Nama lengkap", { autoComplete: "name", value: f.name, onChange: set("name") })}
        {field("c-email", "Email", { type: "email", autoComplete: mode === "login" ? "username" : "email", value: f.email, onChange: set("email") })}
        {mode === "forgot" ? null : mode === "login"
          ? field("c-pw", "Kata sandi", { type: "password", autoComplete: "current-password", value: f.pw, onChange: set("pw") })
          : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {field("c-pw1", "Kata sandi", { type: "password", autoComplete: "new-password", value: f.pw, onChange: set("pw") })}
                {field("c-pw2", "Ulangi", { type: "password", autoComplete: "new-password", value: f.pw2, onChange: set("pw2") })}
              </div>
              <span className="text-[13px] font-light text-stone">
                {PASSWORD_HINT} Jika email Anda sudah tercatat di toko, riwayat &amp; saldo deposit tersambung setelah email dikonfirmasi.
              </span>
            </>
          )}
        {err && <div role="alert" className="border border-[#E3B4AE] bg-[#FBEDEB] px-3.5 py-3 text-sm text-[#9B2C22]">{err}</div>}
        {info && <div role="status" className="border border-gold/50 bg-lux-3 px-3.5 py-3 text-sm text-sand">{info}</div>}
        <Turnstile key={attempt} onToken={setCaptcha} />
        <button disabled={busy} className="btn-gold w-full">
          {busy ? "Memproses…" : mode === "login" ? "Masuk" : mode === "forgot" ? "Kirim tautan" : "Buat akun"}
        </button>
        {mode === "login" && (
          <button type="button" onClick={() => { setMode("forgot"); setErr(""); setInfo(""); }} className="self-start py-2 text-[13px] font-light text-gold underline">
            Lupa kata sandi?
          </button>
        )}
        {mode === "forgot" && (
          <button type="button" onClick={() => { setMode("login"); setErr(""); setInfo(""); }} className="self-start py-2 text-[13px] font-light text-dust underline">Kembali ke masuk</button>
        )}
      </form>
    </div>
  );
}
