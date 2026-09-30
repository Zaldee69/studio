export const TZ = "Asia/Jakarta";

/** 1500000 → "Rp1.500.000" */
export function formatRupiah(n: number): string {
  const s = "Rp" + Math.abs(Math.round(n)).toLocaleString("id-ID");
  return n < 0 ? "-" + s : s;
}

const tanggal = new Intl.DateTimeFormat("id-ID", {
  weekday: "long", day: "numeric", month: "short", year: "numeric", timeZone: TZ,
});
/** → "Senin, 28 Sep 2026" (Asia/Jakarta) */
export function formatTanggal(d: Date | string): string {
  return tanggal.format(new Date(d));
}

const jam = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: TZ });
/** → "09.30" */
export function formatJam(d: Date | string): string {
  return jam.format(new Date(d));
}

/** Tanggal hari ini di Jakarta, "YYYY-MM-DD". */
export function jktDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
}

/** 08xx / +62 / 8xx → "62xxx". Null jika tidak valid. Cermin normalize_wa() di SQL. */
export function normalizeWhatsApp(raw: string | null | undefined): string | null {
  const n = (raw ?? "").replace(/\D/g, "");
  if (/^62\d{8,13}$/.test(n)) return n;
  if (/^0\d{8,13}$/.test(n)) return "62" + n.slice(1);
  if (/^8\d{7,12}$/.test(n)) return "62" + n;
  return null;
}
