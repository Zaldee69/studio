"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
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
    if (pw.a.length < 8) return setErr("Kata sandi minimal 8 karakter.");
    if (pw.a !== pw.b) return setErr("Kedua kata sandi tidak sama.");
    setBusy(true);
    const { error } = await createClient().auth.updateUser({ password: pw.a });
    setBusy(false);
    if (error) return setErr(error.message);
    router.replace("/akun");
  }

  return (
    <div className="flex w-full max-w-[460px] flex-col gap-5">
      <span className="eyebrow">Akun pelanggan</span>
      <h1 className="-mt-2 font-serif text-[44px] font-normal leading-none">Kata sandi <i className="text-gold">baru.</i></h1>
      {phase === "checking" && <p className="text-sand">Memeriksa tautan…</p>}
      {phase === "invalid" && <p role="alert" className="border border-[#7A2E26] bg-[#2A1512] px-3.5 py-3 text-sm text-[#F2B8B0]">Tautan tidak valid atau kedaluwarsa. Minta tautan baru dari halaman Masuk.</p>}
      {phase === "ready" && (
        <form onSubmit={save} className="flex flex-col gap-4">
          {(["a", "b"] as const).map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <label htmlFor={`np-${k}`} className="lux-label">{k === "a" ? "Kata sandi baru (min. 8)" : "Ulangi"}</label>
              <input id={`np-${k}`} type="password" autoComplete="new-password" className="lux-input" value={pw[k]} onChange={(e) => { setPw({ ...pw, [k]: e.target.value }); setErr(""); }} />
            </div>
          ))}
          {err && <p role="alert" className="border border-[#7A2E26] bg-[#2A1512] px-3.5 py-3 text-sm text-[#F2B8B0]">{err}</p>}
          <button disabled={busy} className="btn-gold w-full">{busy ? "Menyimpan…" : "Simpan kata sandi"}</button>
        </form>
      )}
    </div>
  );
}
