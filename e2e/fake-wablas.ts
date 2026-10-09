import { createServer } from "node:http";

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
