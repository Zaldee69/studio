// Gerbang Lighthouse (mobile, throttling simulasi): / dan /booking harus ≥ 90 di semua kategori.
// Pakai: jalankan server produksi (`npm run build && npx next start -p 3100`), lalu `npm run test:lighthouse`.
// Tiap halaman diukur 3× dan diambil median, karena skor performa di mesin lokal berfluktuasi.
// CHROME_PATH default ke Chromium milik Playwright; BASE_URL default http://127.0.0.1:3100.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3100";
const PAGES = ["/", "/booking"];
const MIN = 90, RUNS = 3;
const chrome = process.env.CHROME_PATH ?? chromium.executablePath();
if (!existsSync(chrome)) throw new Error(`Chrome tidak ditemukan (${chrome}). Jalankan: npx playwright install chromium`);
const dir = mkdtempSync(join(tmpdir(), "gb-lh-"));

let fail = false;
for (const path of PAGES) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const out = join(dir, `lh-${i}.json`);
    execFileSync("npx", ["-y", "lighthouse@12", BASE + path, "--quiet", "--chrome-flags=--headless=new",
      "--only-categories=performance,accessibility,best-practices,seo", "--output=json", `--output-path=${out}`],
      { stdio: "ignore", env: { ...process.env, CHROME_PATH: chrome } });
    runs.push(JSON.parse(readFileSync(out, "utf8")).categories);
  }
  const scores = Object.keys(runs[0]).map((id) => {
    const s = runs.map((r) => Math.round(r[id].score * 100)).sort((a, b) => a - b)[Math.floor(RUNS / 2)];
    if (s < MIN) fail = true;
    return `${id} ${s}${s < MIN ? " ✗" : ""}`;
  });
  console.log(`${path.padEnd(10)} ${scores.join(" · ")}`);
}
if (fail) { console.error(`Ada skor di bawah ${MIN}.`); process.exit(1); }
