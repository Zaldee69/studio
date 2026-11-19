/** IP untuk dicocokkan dengan WiFi toko. IPv6 dipangkas ke 4 grup pertama (/64): satu jaringan rumah/toko bisa memberi HP alamat IPv6 berbeda-beda. */
export function normalizeIp(raw: string): string {
  const ip = raw.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, "$1");
  if (!ip.includes(":")) return ip;
  const [head, tail = ""] = ip.split("::");
  const a = head ? head.split(":") : [];
  const b = tail ? tail.split(":") : [];
  const full = ip.includes("::") ? [...a, ...Array(Math.max(0, 8 - a.length - b.length)).fill("0"), ...b] : a;
  return full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":") + "::/64";
}

export function clientIp(h: Headers): string {
  return normalizeIp((h.get("x-forwarded-for") ?? "").split(",")[0] || h.get("x-real-ip") || "");
}
