"use client";

import { CalendarIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { id as localeId } from "react-day-picker/locale";
import { useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

// Pemilih rentang tanggal (pengganti dua DateInput "Dari" + "Sampai"): kalender shadcn mode `range`, dua bulan di layar lebar.
// Nilai "YYYY-MM-DD". Ikut terkirim di <form> lewat nameFrom/nameTo; atau dikendalikan lewat value/onChange.
export type IsoRange = { from: string; to: string };
type Props = {
  nameFrom?: string; nameTo?: string; value?: IsoRange; defaultValue?: IsoRange; min?: string; max?: string;
  disabled?: boolean; className?: string; id?: string; "aria-label"?: string;
  onChange?: (r: IsoRange) => void;
};

const toDate = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmt = (iso: string, year = true) => new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}) }).format(toDate(iso));
const wide = "(min-width: 720px)";
const useWide = () => useSyncExternalStore(
  (cb) => { const m = matchMedia(wide); m.addEventListener("change", cb); return () => m.removeEventListener("change", cb); },
  () => matchMedia(wide).matches, () => true);

export function DateRangeInput({ nameFrom, nameTo, value, defaultValue, min, max, disabled, className, id, onChange, ...rest }: Props) {
  const [inner, setInner] = useState<IsoRange>(defaultValue ?? { from: "", to: "" });
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const two = useWide();
  const cur = value ?? inner;
  const sameYear = cur.from && cur.to && cur.from.slice(0, 4) === cur.to.slice(0, 4);
  const text = cur.from && cur.to ? (cur.from === cur.to ? fmt(cur.from) : `${fmt(cur.from, !sameYear)} – ${fmt(cur.to)}`) : "Pilih rentang tanggal";
  // klik pertama memulai rentang baru (bukan memperpanjang yang lama); klik kedua menutup
  const select = (r: DateRange | undefined, clicked: Date) => {
    if (!draft || (draft.from && draft.to)) { setDraft({ from: clicked, to: undefined }); return; }
    const a = draft.from!; const [from, to] = clicked < a ? [clicked, a] : [a, clicked];
    const next = { from: toIso(from), to: toIso(to) };
    if (value === undefined) setInner(next);
    onChange?.(next); setDraft(undefined); setOpen(false);
    void r;
  };
  const shown: DateRange | undefined = draft ?? (cur.from ? { from: toDate(cur.from), to: cur.to ? toDate(cur.to) : undefined } : undefined);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setDraft(undefined); }}>
      <PopoverTrigger asChild>
        <button type="button" id={id} disabled={disabled} aria-label={rest["aria-label"]}
          className={cn("relative flex min-h-11 w-full min-w-0 items-center gap-2 rounded-[14px] border border-input bg-card px-3 text-left field-text text-ink outline-none transition-colors hover:border-ink/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50", className)}>
          <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className={cn("min-w-0 flex-1 truncate tabular-nums", !cur.from && "text-muted-foreground")}>{text}</span>
          {nameFrom && <input type="hidden" name={nameFrom} value={cur.from} />}
          {nameTo && <input type="hidden" name={nameTo} value={cur.to} />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-2">
        <Calendar mode="range" locale={localeId} weekStartsOn={1} autoFocus numberOfMonths={two ? 2 : 1}
          selected={shown} defaultMonth={shown?.from} onSelect={select}
          disabled={[...(min ? [{ before: toDate(min) }] : []), ...(max ? [{ after: toDate(max) }] : [])]}
          className="[--cell-size:--spacing(11)] field-text" />
      </PopoverContent>
    </Popover>
  );
}
