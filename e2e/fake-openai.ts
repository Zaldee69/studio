import { createServer, type Server } from "node:http";
import sharp from "sharp";

// OpenAI tiruan untuk E2E (server tes diarahkan ke sini lewat OPENAI_BASE_URL di playwright.config).
export const FAKE_OPENAI_PORT = 3199;
export const PNG_1PX = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

export type Call = { path: string; auth: string | undefined; body: string };

/** consult: isi JSON yang "dikembalikan model" untuk /chat/completions. */
export function startFakeOpenAI(consult: () => unknown) {
  const calls: Call[] = [];
  const server: Server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("latin1");
      calls.push({ path: req.url ?? "", auth: req.headers.authorization, body });
      res.setHeader("content-type", "application/json");
      if (req.url === "/v1/chat/completions") {
        res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(consult()) } }] }));
      } else if (req.url === "/v1/images/edits") {
        // "hasil generate" = biru polos 64×96 — wajah asli (bukan biru) harus ditempel kembali oleh server
        sharp({ create: { width: 64, height: 96, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer()
          .then((b) => res.end(JSON.stringify({ data: [{ b64_json: b.toString("base64") }] })));
      } else {
        res.statusCode = 404; res.end("{}");
      }
    });
  });
  return new Promise<{ calls: Call[]; close: () => Promise<void> }>((resolve) =>
    server.listen(FAKE_OPENAI_PORT, "127.0.0.1", () => resolve({ calls, close: () => new Promise((r) => server.close(() => r())) })));
}
