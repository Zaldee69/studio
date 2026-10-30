"use client";

import Link from "next/link";
import { Fragment, useActionState } from "react";
import { MIN_TEXT, questionsFor, type Position } from "@/lib/domain/lamaran";
import { applyJob } from "./actions";

export function ApplyForm({ position }: { position: Position }) {
  const [state, action, pending] = useActionState(applyJob, undefined);
  if (state?.ok) return <p role="status" className="rounded-2xl border border-rule-2 bg-lux-2 p-6 text-lg leading-relaxed text-cream">{state.ok}</p>;
  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="position" value={position} />
      <div aria-hidden="true" className="absolute -left-[9999px]"><input name="website" tabIndex={-1} autoComplete="off" /></div>
      <div className="flex flex-col gap-2">
        <label htmlFor="lm-name" className="lux-label">Nama lengkap</label>
        <input id="lm-name" name="name" required minLength={2} maxLength={60} autoComplete="name" className="lux-input" />
      </div>
      <div className="flex flex-col gap-2">
        <label htmlFor="lm-wa" className="lux-label">No. WhatsApp</label>
        <input id="lm-wa" name="whatsapp" required inputMode="tel" autoComplete="tel" placeholder="08…" className="lux-input" />
      </div>
      {questionsFor(position).map((q, i, all) => {
        const id = `lm-${q.key}`;
        const head = i === 0 || all[i - 1].section !== q.section
          ? <h2 key={`h-${q.section}`} className="mt-4 border-t border-rule pt-6 font-serif text-2xl text-gold">{q.section}</h2> : null;
        if (q.type === "checks") return (<Fragment key={q.key}>{head}
          <fieldset className="flex flex-col gap-1">
            <legend className="lux-label mb-2">{q.label} (pilih minimal satu)</legend>
            {q.options!.map((o) => (
              <label key={o} className="flex min-h-11 items-center gap-3 text-base text-cream">
                <input type="checkbox" name={q.key} value={o} className="size-5 accent-gold" />{o}
              </label>
            ))}
          </fieldset></Fragment>
        );
        return (<Fragment key={q.key}>{head}
          <div className="flex flex-col gap-2">
            <label htmlFor={id} className="lux-label">{q.label}{q.optional && " (boleh dikosongkan)"}</label>
            {q.type === "select" ? (
              <select id={id} name={q.key} required={!q.optional} defaultValue="" className="lux-input">
                <option value="" disabled={!q.optional}>Pilih…</option>
                {q.options!.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : q.type === "textarea" ? (
              <textarea id={id} name={q.key} required={!q.optional} minLength={MIN_TEXT} maxLength={1000} rows={3} className="lux-input h-auto py-3" />
            ) : (
              <input id={id} name={q.key} required={!q.optional} placeholder={q.hint} maxLength={q.type === "number" ? 3 : 200}
                inputMode={q.type === "number" ? "numeric" : undefined} className="lux-input" />
            )}
          </div></Fragment>
        );
      })}
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button disabled={pending} className="btn-gold">{pending ? "Mengirim…" : "Kirim lamaran"}</button>
      <p className="text-sm leading-relaxed text-stone">
        Data Anda hanya dipakai untuk proses rekrutmen D&apos;Pras Studio. Lihat <Link href="/kebijakan-privasi" className="underline">kebijakan privasi</Link>.
      </p>
    </form>
  );
}
