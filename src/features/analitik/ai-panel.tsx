"use client";

import { useState, useTransition } from "react";
import { analitikAi } from "@/app/manajer/analitik/ai-actions";

type Meeting = { week: string; notes: string };
type Period = { periode: string; dari: string; sampai: string; kategori: string; staf: string };
type Item = { q: string; a: string; error?: boolean };
const weekLabel = (d: string) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));

/** Asisten AI Analitik: notulen rapat AI mingguan (tanpa biaya AI), "Jelaskan periode ini", dan "Tanya data". */
export function AiPanel({ meetings, period, label }: { meetings: Meeting[]; period: Period; label: string }) {
  const [week, setWeek] = useState(meetings[0]?.week ?? "");
  const [items, setItems] = useState<Item[]>([]);
  const [question, setQuestion] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [pending, start] = useTransition();
  const m = meetings.find((x) => x.week === week);

  function run(q: string | null) {
    start(async () => {
      const r = await analitikAi(period, q);
      const title = q ?? `Penjelasan periode ${label}`;
      setItems((xs) => [r.ok ? { q: title, a: r.text } : { q: title, a: r.error, error: true }, ...xs]);
      if (r.ok) { setLeft(r.left); if (q) setQuestion(""); }
    });
  }

  return (
    <section aria-label="Asisten AI" className="flex flex-col gap-4 rounded-[14px] border border-line bg-card p-4 print:hidden">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="flex-1 font-display text-lg font-semibold">Asisten AI</h2>
        <span className="text-xs text-muted">Jawaban AI dibuat dari angka di halaman ini. Cek ulang sebelum memutuskan.</span>
      </div>

      {meetings.length > 0 && (
        <details open className="rounded-[12px] bg-paper p-3">
          <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2 text-sm font-semibold">
            Notulen rapat AI mingguan
            <select aria-label="Minggu" value={week} onClick={(e) => e.stopPropagation()} onChange={(e) => setWeek(e.target.value)} className="input h-9 w-auto py-0 text-sm font-normal">
              {meetings.map((x) => <option key={x.week} value={x.week}>Minggu mulai {weekLabel(x.week)}</option>)}
            </select>
          </summary>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{m?.notes}</p>
        </details>
      )}

      <div className="flex flex-wrap items-end gap-2">
        <button type="button" disabled={pending} onClick={() => run(null)} className="btn-ink h-11">Jelaskan periode ini</button>
        <form className="flex min-w-64 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (question.trim()) run(question); }}>
          <label htmlFor="ai-q" className="sr-only">Tanya data</label>
          <input id="ai-q" value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500}
            placeholder="Tanya data, mis. hari apa paling sepi minggu ini?" className="input h-11 flex-1" />
          <button disabled={pending || !question.trim()} className="btn-ghost h-11">Tanya</button>
        </form>
      </div>
      {pending && <p role="status" className="text-sm text-muted">AI sedang membaca angka…</p>}
      {items.map((it, i) => (
        <article key={items.length - i} className="flex flex-col gap-1 border-t border-line pt-3">
          <b className="text-sm">{it.q}</b>
          <p role={it.error ? "alert" : undefined} className={`whitespace-pre-line text-sm leading-relaxed ${it.error ? "text-danger" : ""}`}>{it.a}</p>
        </article>
      ))}
      {left !== null && <p className="text-xs text-muted">Sisa {left} permintaan AI dalam 24 jam.</p>}
    </section>
  );
}
