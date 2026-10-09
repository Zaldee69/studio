// Dipakai komponen server (slip) & klien — jangan taruh di modul "use client".
export const CAT = { barbershop: { label: "Barbershop", color: "#5646C8" }, nail: { label: "Nail Art", color: "#C2477E" }, massage: { label: "Pijat", color: "#2E8B62" } } as const;
export const monthLabel = (m: string) => new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));
export const shiftMonth = (m: string, d: number) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1 + d, 1)).toISOString().slice(0, 7);
