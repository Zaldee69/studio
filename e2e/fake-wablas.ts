import { createServer } from "node:http";
import { sql } from "./helpers";

// Wablas tiruan untuk E2E (server tes diarahkan ke sini lewat WABLAS_URL di playwright.config).
export type WaSent = { auth?: string; phone: string; message: string; flag: string | null };

export function startFakeWablas(port = 3197) {
  const sent: WaSent[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const f = new URLSearchParams(body);
      sent.push({ auth: req.headers.authorization, phone: f.get("phone") ?? "", message: f.get("message") ?? "", flag: f.get("flag") });
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: true, message: "Message is pending and waiting to be processed" }));
    });
  });
  return {
    sent,
    listen: () => new Promise<void>((r) => server.listen(port, "127.0.0.1", () => r())),
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/**
 * Untuk spec yang butuh WhatsApp sungguhan-tiruan (kode masuk pelanggan, blast): jalankan Wablas tiruan dan arahkan
 * pemicu pengiriman DB lokal (app_config.notify_url, biasanya dev server :3000) ke server tes :3100 selama spec ini.
 */
export function withFakeWablas(test: { beforeAll(fn: () => Promise<void>): void; afterAll(fn: () => Promise<void>): void }) {
  const w = startFakeWablas();
  let url = "";
  test.beforeAll(async () => {
    await w.listen();
    [{ url }] = sql<{ url: string }>("select value as url from app_config where key = 'notify_url'");
    sql("update app_config set value = 'http://host.docker.internal:3100/api/notifications/dispatch' where key = 'notify_url'");
  });
  test.afterAll(async () => {
    if (url) sql(`update app_config set value = '${url}' where key = 'notify_url'`);
    await w.close();
  });
  /** Kode 6 digit terakhir yang dikirim ke nomor 62… (menunggu sampai tiba). */
  const code = async (wa62: string) => {
    for (let i = 0; i < 60; i++) {
      const m = w.sent.findLast((x) => x.phone === wa62 && /Kode masuk/.test(x.message));
      if (m) return m.message.match(/\b(\d{6})\b/)![1];
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`Kode WA untuk ${wa62} tidak terkirim`);
  };
  return { ...w, code };
}
