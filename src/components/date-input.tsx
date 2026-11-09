"use client";

import { CalendarIcon } from "lucide-react";
import { id as localeId } from "react-day-picker/locale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Isian tanggal pengganti <input type="date"> (keluhan manajer 10 Nov: kalender bawaan browser terlalu kecil di tablet).
// API sama: value/defaultValue "YYYY-MM-DD", name (ikut terkirim di <form>), min, max, required, onChange(e.target.value).
// Kalender shadcn dengan sel 44px, minggu mulai Senin, bahasa Indonesia.
type Props = {
  id?: string; name?: string; value?: string; defaultValue?: string; min?: string; max?: string;
  required?: boolean; disabled?: boolean; className?: string; title?: string;
  "aria-label"?: string; placeholder?: string;
  onChange?: (e: { target: { value: string } }) => void;
  /** isi tombol; bawaan: "Sel, 10 Nov 2026" */
  display?: (iso: string) => React.ReactNode;
};

const toDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const label = (iso: string) => new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", year: "numeric" }).format(toDate(iso));

export function DateInput({ id, name, value, defaultValue, min, max, required, disabled, className, title, display, placeholder = "Pilih tanggal", onChange, ...rest }: Props) {
  const [inner, setInner] = useState(defaultValue ?? "");
  const [open, setOpen] = useState(false);
  const cur = value ?? inner;
  const pick = (d: Date | undefined) => {
    if (!d) return;
    const iso = toIso(d);
    if (value === undefined) setInner(iso);
    onChange?.({ target: { value: iso } });
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" id={id} disabled={disabled} title={title} aria-label={rest["aria-label"]}
          className={cn("relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[10px] border border-input bg-card px-3 text-left text-base text-ink outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 disabled:cursor-not-allowed disabled:bg-paper disabled:text-muted-foreground", className)}>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn("min-w-0 flex-1 truncate tabular-nums", !cur && "text-muted-foreground")}>{cur ? (display ? display(cur) : label(cur)) : placeholder}</span>
          {/* ikut terkirim di <form> & ikut validasi required (input tersembunyi tidak divalidasi browser) */}
          {name && <input tabIndex={-1} aria-hidden="true" name={name} value={cur} required={required} onChange={() => {}}
            className="pointer-events-none absolute inset-0 opacity-0" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar mode="single" locale={localeId} weekStartsOn={1} autoFocus
          selected={cur ? toDate(cur) : undefined} defaultMonth={cur ? toDate(cur) : undefined} onSelect={pick}
          disabled={[...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])]}
          className="[--cell-size:--spacing(11)] text-base" />
      </PopoverContent>
    </Popover>
  );
}
