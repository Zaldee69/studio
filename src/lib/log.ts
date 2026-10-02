// Log terstruktur: satu baris JSON per kejadian → Vercel Logs (dan Log Drain) bisa difilter per field (event, level…).
// Jangan masukkan data pribadi (nama, no. WA, email, isi catatan) — cukup id & kode.
type Level = "info" | "warn" | "error";

export function log(level: Level, event: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const errInfo = (e: unknown) =>
  e instanceof Error ? { error: e.message, stack: e.stack?.split("\n").slice(0, 6).join("\n") } : { error: String(e) };
