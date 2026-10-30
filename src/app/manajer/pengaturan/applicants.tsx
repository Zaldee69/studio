"use client";

import { useActionState } from "react";
import { formatTanggal } from "@/lib/domain/format";
import { POSITION_NAME, questionsFor, type Position } from "@/lib/domain/lamaran";
import { updateApplication } from "./actions";

type App = { id: string; position: string; name: string; whatsapp: string; answers: unknown; status: string; note: string; created_at: string };
const STATUS = [["baru", "Baru"], ["dihubungi", "Sudah dihubungi"], ["tes", "Tes / wawancara"], ["diterima", "Diterima"], ["ditolak", "Tidak lanjut"]] as const;

/** Lamaran dari /karir, terbaru di atas. Status & catatan hanya untuk manajer. */
export function Applicants({ rows }: { rows: App[] }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Formulir lamaran: <a href="/karir" target="_blank" className="font-semibold text-accent underline">dprasstudio.com/karir</a> (capster) ·{" "}
        <a href="/karir?posisi=kasir" target="_blank" className="font-semibold text-accent underline">/karir?posisi=kasir</a>. Lamaran baru juga dikabarkan lewat Telegram.
      </p>
      {!rows.length && <p className="rounded-2xl border border-line bg-card p-5 text-sm text-muted">Belum ada lamaran.</p>}
      {rows.map((a) => <Card key={a.id} a={a} />)}
    </div>
  );
}

function Card({ a }: { a: App }) {
  const [state, action, pending] = useActionState(updateApplication, undefined);
  const pos = a.position as Position;
  const ans = (a.answers ?? {}) as Record<string, string | string[]>;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-5">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <b className="font-display text-lg">{a.name}</b>
        <span className="text-sm text-muted">{POSITION_NAME[pos]} · {formatTanggal(a.created_at)}</span>
        <a href={`https://wa.me/${a.whatsapp}`} target="_blank" className="ml-auto text-sm font-semibold text-accent underline">WA {a.whatsapp}</a>
      </header>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        {questionsFor(pos).filter((q) => ans[q.key] !== undefined).map((q) => (
          <div key={q.key} className={q.type === "textarea" ? "sm:col-span-2" : ""}>
            <dt className="text-xs text-muted">{q.label}</dt>
            <dd className="whitespace-pre-line">{[ans[q.key]].flat().join(", ")}</dd>
          </div>
        ))}
      </dl>
      <form action={action} className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
        <input type="hidden" name="id" value={a.id} />
        <div><label htmlFor={`st-${a.id}`} className="label">Status</label>
          <select id={`st-${a.id}`} name="status" defaultValue={a.status} className="input w-auto">
            {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select></div>
        <div className="min-w-56 flex-1"><label htmlFor={`nt-${a.id}`} className="label">Catatan</label>
          <input id={`nt-${a.id}`} name="note" defaultValue={a.note} maxLength={500} placeholder="mis. tes potong Selasa 3 Nov" className="input" /></div>
        <button disabled={pending} className="btn-primary">Simpan</button>
        {state && <p role={state.error ? "alert" : "status"} className={`text-xs ${state.error ? "text-danger" : "text-green-700"}`}>{state.error ?? state.ok}</p>}
      </form>
    </article>
  );
}
