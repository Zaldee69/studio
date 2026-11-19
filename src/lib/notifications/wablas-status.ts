/** Membaca jawaban GET {WABLAS_URL}/api/device/info: data.status = "connected" | "disconnected", data.active, data.expired_date. */
export type DeviceHealth = { ok: boolean; connected: boolean; expired: string | null; quota: number | null; detail: string };

export function readDeviceInfo(httpOk: boolean, json: unknown): DeviceHealth {
  const j = json as { status?: boolean; message?: string; data?: { status?: string; active?: boolean; expired_date?: string; quota?: number; sender?: string } } | null;
  if (!httpOk || !j || j.status !== true || !j.data) return { ok: false, connected: false, expired: null, quota: null, detail: (j?.message ?? "Wablas tidak menjawab dengan benar").slice(0, 160) };
  const d = j.data;
  const connected = d.status === "connected" && d.active !== false;
  const expired = typeof d.expired_date === "string" && /^\d{4}-\d{2}-\d{2}/.test(d.expired_date) ? d.expired_date.slice(0, 10) : null;
  return { ok: true, connected, expired, quota: typeof d.quota === "number" ? d.quota : null,
    detail: `status ${d.status ?? "?"}${d.active === false ? ", perangkat nonaktif" : ""}${d.sender ? `, nomor ${d.sender}` : ""}` };
}
