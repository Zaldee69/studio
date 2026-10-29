"use client";

import Link from "next/link";
import { useActionState } from "react";
import { joinWaitlist } from "./actions";

export function WaitlistForm({ interest, src }: { interest: "nail" | "lashes" | null; src: string }) {
  const [state, action, pending] = useActionState(joinWaitlist, undefined);
  if (state?.ok) return <p role="status" className="rounded-2xl border border-rule-2 bg-lux-2 p-6 text-lg leading-relaxed text-cream">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="src" value={src} />
      <div aria-hidden="true" className="absolute -left-[9999px]"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      <div className="flex flex-col gap-2">
        <label htmlFor="wt-name" className="lux-label">Nama</label>
        <input id="wt-name" name="name" required minLength={2} maxLength={60} autoComplete="name" className="lux-input" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="wt-wa" className="lux-label">No. WhatsApp</label>
        <input id="wt-wa" name="whatsapp" required inputMode="tel" autoComplete="tel" placeholder="08…" className="lux-input" />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="lux-label mb-2">Kabari saya untuk</legend>
        {([["nail", "Nail Art"], ["lashes", "Lashes"]] as const).map(([v, l]) => (
          <label key={v} className="flex min-h-11 items-center gap-3 text-base text-cream">
            <input type="checkbox" name="interest" value={v} defaultChecked={!interest || interest === v} className="size-5 accent-gold" />{l}
          </label>
        ))}
      </fieldset>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="btn-gold">{pending ? "Mendaftarkan…" : "Daftar tunggu"}</button>
      <p className="text-sm leading-relaxed text-stone">
        Nomor Kakak hanya kami pakai untuk mengabari pembukaan lini ini. Lihat <Link href="/kebijakan-privasi" className="underline">kebijakan privasi</Link>.
      </p>
    </form>
  );
}
