// Dipakai komponen server (slip) & klien — jangan taruh di modul "use client".
export const CAT = { barbershop: { label: "Barbershop", color: "#5C6B4A" }, nail: { label: "Nail Art", color: "#B05A63" }, massage: { label: "Pijat", color: "#9A6B3C" } } as const;
export const monthLabel = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
export const shiftMonth = (m: string, d: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1)).toISOString().slice(0, 7);

// Minggu komisi Senin–Minggu (tanggal "YYYY-MM-DD", tanpa jam — aman dari zona waktu).
const day = (d: string) => new Date(`${d}T00:00:00Z`);
const plusDays = (d: string, n: number) => { const t = day(d); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
/** Senin di minggu tanggal itu. */
export const mondayOf = (d: string) => plusDays(d, -((day(d).getUTCDay() + 6) % 7));
export const shiftWeek = (monday: string, n: number) => plusDays(monday, 7 * n);
/** "28 Sep – 4 Okt 2026" */
export const weekLabel = (monday: string) => {
  const f = (d: string, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("id-ID", { ...o, timeZone: "UTC" }).format(day(d));
  return `${f(monday, { day: "numeric", month: "short" })} – ${f(plusDays(monday, 6), { day: "numeric", month: "short", year: "numeric" })}`;
};
