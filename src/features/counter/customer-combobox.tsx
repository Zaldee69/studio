"use client";

import { useEffect, useId, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Customer } from "./types";

/** Cari pelanggan lama berdasarkan nama / no. WA; hasil muncul saat mengetik. */
export function CustomerCombobox({ id, value, onChange, emptyLabel, autoFocus }: {
  id: string; value: Customer | null; onChange: (c: Customer | null) => void; emptyLabel: string; autoFocus?: boolean;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; list: Customer[] }>({ q: "", list: [] });
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listId = useId();

  const term = q.replace(/[,()%*]/g, " ").trim();
  useEffect(() => {
    if (term.length < 2) return;
    let alive = true;
    const t = setTimeout(async () => {
      const digits = term.replace(/\D/g, "").replace(/^0/, "");
      const filter = digits.length >= 3 ? `name.ilike.%${term}%,whatsapp.ilike.%${digits}%` : `name.ilike.%${term}%`;
      const { data } = await createClient().from("customers").select("id, name, whatsapp, notes").or(filter).order("name").limit(8);
      if (alive) { setRes({ q: term, list: data ?? [] }); setHi(0); }
    }, 180);
    return () => { alive = false; clearTimeout(t); };
  }, [term]);
  const list = term.length >= 2 && res.q === term ? res.list : [];

  if (value) {
    return (
      <div className="flex min-h-11 items-center gap-2 rounded-[10px] border border-[#D9D4C8] bg-card px-3">
        <span className="flex min-w-0 flex-1 flex-col py-1.5">
          <b className="truncate text-sm">{value.name}</b>
          {value.whatsapp && <span className="text-xs text-muted tabular">{value.whatsapp}</span>}
        </span>
        <button type="button" onClick={() => onChange(null)} className="min-h-10 rounded-lg px-2 text-xs font-bold text-muted hover:bg-paper">Ganti</button>
      </div>
    );
  }

  const pick = (c: Customer) => { onChange(c); setQ(""); setOpen(false); };
  return (
    <div className="relative">
      <input id={id} role="combobox" aria-expanded={open && list.length > 0} aria-controls={listId} aria-autocomplete="list"
        autoComplete="off" autoFocus={autoFocus} placeholder={`${emptyLabel} — ketik nama / no. WA untuk mencari`}
        value={q} className="input"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, list.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter") { e.preventDefault(); pick(list[hi]); }
        }} />
      {open && term.length >= 2 && (
        <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-card py-1 shadow-[0_12px_32px_rgba(28,27,25,0.14)]">
          {res.q !== term ? <li className="px-3 py-2.5 text-sm text-muted">Mencari…</li>
            : !list.length ? <li className="px-3 py-2.5 text-sm text-muted">Tidak ditemukan.</li>
            : list.map((c, i) => (
              <li key={c.id} role="option" aria-selected={i === hi}
                onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                className={`flex min-h-11 cursor-pointer flex-col justify-center px-3 py-1.5 ${i === hi ? "bg-paper" : ""}`}>
                <b className="text-sm">{c.name}</b>
                {c.whatsapp && <span className="text-xs text-muted tabular">{c.whatsapp}</span>}
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
