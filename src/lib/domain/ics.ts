import { BRAND } from "../brand";
// File kalender .ics (RFC 5545) untuk "Tambahkan ke kalender", zona Asia/Jakarta (UTC+7, tanpa DST).
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** ISO → "YYYYMMDDTHHMMSS" waktu lokal Jakarta. */
function jktStamp(iso: string) {
  const d = new Date(Date.parse(iso) + 7 * 3600_000);
  return d.toISOString().slice(0, 19).replace(/[-:]/g, "");
}

export function buildIcs(e: { uid: string; start: string; end: string; title: string; description?: string; location?: string; now?: Date }): string {
  const stamp = (e.now ?? new Date()).toISOString().slice(0, 19).replace(/[-:]/g, "") + "Z";
  return [
    "BEGIN:VCALENDAR", "VERSION:2.0", `PRODID:-//${BRAND}//Booking//ID`, "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE", "TZID:Asia/Jakarta", "BEGIN:STANDARD", "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0700", "TZOFFSETTO:+0700", "TZNAME:WIB", "END:STANDARD", "END:VTIMEZONE",
    "BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${stamp}`,
    `DTSTART;TZID=Asia/Jakarta:${jktStamp(e.start)}`, `DTEND;TZID=Asia/Jakarta:${jktStamp(e.end)}`,
    `SUMMARY:${esc(e.title)}`, ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []), ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR", "",
  ].join("\r\n");
}
