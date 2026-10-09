"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { passwordError, PASSWORD_HINT } from "@/lib/password";
import { createClient } from "@/lib/supabase/client";

/** Tautan email "lupa kata sandi" → tukar kode (PKCE) jadi sesi → simpan kata sandi baru. */
export function NewPassword() {
  const router = useRouter();
  const params = useSearchParams();
  const [phase, setPhase] = useState<"checking" | "ready" | "invalid">("checking");
  const [pw, setPw] = useState({ a: "", b: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const code = params.get("code");
    const supabase = createClient();
    (code ? supabase.auth.exchangeCodeForSession(code).then((r) => !r.error) : supabase.auth.getUser().then((r) => !!r.data.user))
      .then((ok) => setPhase(ok ? "ready" : "invalid"));
  }, [params]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const weak = passwordError(pw.a);
    if (weak) return setErr(weak);
    if (pw.a !== pw.b) return setErr("Kedua kata sandi tidak sama.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw.a });
    setBusy(false);
    if (error) return setErr(error.code === "same_password" ? "Pakai kata sandi yang berbeda dari sebelumnya." : error.code === "weak_password" ? `Kata sandi terlalu lemah. ${PASSWORD_HINT}` : "Gagal menyimpan. Minta tautan baru dari halaman Masuk.");
    router.replace("/akun");
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5">
      <span className="eyebrow">Akun pelanggan</span>
      <h1 className="-mt-2 font-serif text-[44px] font-normal leading-none">Kata sandi <i className="text-gold">baru.</i></h1>
      {phase === "checking" && <p className="text-sand">Memeriksa tautan…</p>}
      {phase === "invalid" && <p role="alert" className="border border-[#E3B4AE] bg-[#FBEDEB] px-3.5 py-3 text-sm text-[#9B2C22]">Tautan tidak valid atau kedaluwarsa. Minta tautan baru dari halaman Masuk.</p>}
      {phase === "ready" && (
        <form onSubmit={save} className="flex flex-col gap-4">
          {(["a", "b"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <label htmlFor={`np-${k}`} className="lux-label">{k === "a" ? "Kata sandi baru (min. 8, huruf & angka)" : "Ulangi"}</label>
              <input id={`np-${k}`} type="password" autoComplete="new-password" className="lux-input" value={pw[k]} onChange={(e) => { setPw({ ...pw, [k]: e.target.value }); setErr(""); }} />
            </div>
          ))}
          {err && <p role="alert" className="border border-[#E3B4AE] bg-[#FBEDEB] px-3.5 py-3 text-sm text-[#9B2C22]">{err}</p>}
          <button disabled={busy} className="btn-gold w-full">{busy ? "Menyimpan…" : "Simpan kata sandi"}</button>
        </form>
      )}
    </div>
  );
}
