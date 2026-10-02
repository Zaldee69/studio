"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { captchaOn, Turnstile } from "@/components/turnstile";
import { passwordError, PASSWORD_HINT } from "@/lib/password";
import { homeFor } from "@/lib/roles";
import { createClient } from "@/lib/supabase/client";

// Masuk / daftar tim langsung dari browser ke Supabase Auth (bukan server action): captcha Turnstile ikut terkirim
// dan batas percobaan dihitung per IP pengguna, bukan per IP server.
export function TeamAuth({ register, mfa }: { register: boolean; mfa: boolean }) {
  const router = useRouter();
  const step = mfa ? "mfa" : "form";
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // token captcha sekali pakai → render ulang widget tiap percobaan
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);
  // Sebelum hidrasi tombol mati — submit bawaan browser tidak boleh mengirim sandi lewat URL.
  const hydrated = useSyncExternalStore(() => () => {}, () => true, () => false);

  async function enter() {
    const supabase = createClient();
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
      if (step === "mfa") return setBusy(false);
      return router.replace("/login?mfa=1"); // judul halaman & refresh ikut langkah kode
    }
    const { data: { user } } = await supabase.auth.getUser();
    const { data: p } = user ? await supabase.from("profiles").select("role, active").eq("id", user.id).single() : { data: null };
    router.replace(!p ? "/" : !p.active ? "/login?status=pending" : homeFor(p.role));
    router.refresh();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(""); setInfo("");
    const fd = new FormData(e.currentTarget);
    const v = (k: string) => String(fd.get(k) ?? "").trim();
    const supabase = createClient();

    if (step === "mfa") {
      setBusy(true);
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp[0];
      const { error } = factor ? await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: v("mfa_code") }) : { error: null };
      if (error) { setBusy(false); return setErr("Kode salah atau kedaluwarsa. Coba kode terbaru di aplikasi autentikator."); }
      return enter();
    }

    const email = v("email").toLowerCase(), password = String(fd.get("password") ?? "");
    if (register) {
      if (!v("full_name")) return setErr("Nama wajib diisi");
      if (!/^\S+@\S+\.\S+$/.test(email)) return setErr("Email tidak valid");
      const weak = passwordError(password);
      if (weak) return setErr(weak);
      if (!v("role")) return setErr("Pilih peran");
      if (!v("invite_code")) return setErr("Isi kode undangan");
    } else if (!email || !password) return setErr("Isi email dan kata sandi");
    if (captchaOn() && !captcha) return setErr("Selesaikan verifikasi keamanan dulu.");

    setBusy(true);
    const captchaToken = captcha ?? undefined;
    setCaptcha(null); setAttempt((a) => a + 1);
    if (register) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: {
        captchaToken, emailRedirectTo: `${location.origin}/auth/konfirmasi?untuk=tim`,
        data: { signup: "team", invite_code: v("invite_code"), role: v("role"), full_name: v("full_name") },
      } });
      setBusy(false);
      // Pesan sama untuk kode salah & email terpakai — tidak membocorkan email mana yang terdaftar.
      if (error) return setErr(error.code === "weak_password" ? `Kata sandi terlalu lemah. ${PASSWORD_HINT}`
        : error.code === "over_email_send_rate_limit" || error.status === 429 ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi."
        : "Pendaftaran gagal — periksa kode undangan, atau masuk bila sudah punya akun.");
      if (data.session) return router.replace("/login?status=pending");
      return setInfo(`Kami mengirim tautan konfirmasi ke ${email}. Klik tautannya, lalu akun menunggu aktivasi manajer.`);
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
    if (error) {
      setBusy(false);
      return setErr(error.code === "email_not_confirmed" ? "Email belum dikonfirmasi — klik tautan di email pendaftaran Anda."
        : error.status === 429 ? "Terlalu banyak percobaan. Coba lagi beberapa menit lagi." : "Email atau kata sandi salah");
    }
    await enter();
  }

  async function cancelMfa() {
    await createClient().auth.signOut();
    setErr("");
    router.replace("/login");
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <label htmlFor={name} className="label">{label}</label>
      <input id={name} name={name} className="input" required {...props} />
    </div>
  );

  return (
    <form method="post" onSubmit={submit} className="space-y-4" noValidate>
      {step === "mfa" ? (
        <>
          <p className="text-sm text-muted">Akun ini memakai verifikasi 2 langkah. Masukkan 6 digit kode dari aplikasi autentikator.</p>
          {field("mfa_code", "Kode verifikasi", { inputMode: "numeric", autoComplete: "one-time-code", pattern: "[0-9]{6}", maxLength: 6, autoFocus: true })}
        </>
      ) : register ? (
        <>
          {field("full_name", "Nama lengkap", { autoComplete: "name" })}
          {field("email", "Email", { type: "email", autoComplete: "email" })}
          {field("password", "Kata sandi", { type: "password", autoComplete: "new-password", "aria-describedby": "pw-hint" })}
          <p id="pw-hint" className="-mt-2 text-xs text-muted">{PASSWORD_HINT}</p>
          <div>
            <label htmlFor="role" className="label">Peran</label>
            <select id="role" name="role" className="input" defaultValue="">
              <option value="" disabled>Pilih…</option>
              <option value="cashier">Kasir / front desk</option>
              <option value="staff">Kapster / nail artist</option>
            </select>
          </div>
          {field("invite_code", "Kode undangan", { autoComplete: "off" })}
        </>
      ) : (
        <>
          {field("email", "Email", { type: "email", autoComplete: "username" })}
          {field("password", "Kata sandi", { type: "password", autoComplete: "current-password" })}
        </>
      )}
      {err && <p role="alert" className="text-sm text-danger">{err}</p>}
      {info && <p role="status" className="rounded-lg bg-st-booked p-3 text-sm">{info}</p>}
      {step === "form" && <Turnstile key={attempt} onToken={setCaptcha} />}
      <button type="submit" disabled={busy || !hydrated} className="btn-primary w-full">
        {busy ? "Memproses…" : step === "mfa" ? "Verifikasi" : register ? "Daftar" : "Masuk"}
      </button>
      {step === "mfa" && <button type="button" onClick={cancelMfa} className="min-h-11 text-sm font-semibold text-accent">Batal &amp; keluar</button>}
    </form>
  );
}
