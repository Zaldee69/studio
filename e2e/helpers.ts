import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgrestClient } from "@supabase/postgrest-js";
import { expect, type Browser, type Page, type TestInfo } from "@playwright/test";

export const PW = "password123";
export const USERS = {
  manager: "manajer@groombloom.test", cashier: "kasir@groombloom.test", andi: "andi@groombloom.test", sari: "sari@groombloom.test",
} as const;

export async function login(page: Page, who: keyof typeof USERS) {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Masuk" })).toBeEnabled();
  await page.waitForTimeout(300); // hidrasi
  await page.fill("#email", USERS[who]);
  await page.fill("#password", PW);
  await page.click("button[type=submit]");
  await page.waitForURL((u) => u.pathname !== "/login");
}

/** Sesi tambahan (mis. layar kasir di samping HP kapster); default ukuran laptop. */
export async function newSession(browser: Browser, info: TestInfo, who: keyof typeof USERS, viewport = { width: 1366, height: 768 }) {
  const ctx = await browser.newContext({ ...info.project.use, viewport, hasTouch: false, isMobile: false });
  const page = await ctx.newPage();
  await login(page, who);
  return page;
}

/** Tiap viewport memakai jam berbeda supaya data antar-proyek tidak saling bentrok. */
export function slotHour(info: TestInfo) {
  return { "laptop-1366": 15, "tablet-1024": 17, "portrait-820": 19, "hp-390": 16 }[info.project.name] ?? 15;
}

export const uniq = () => Math.random().toString(36).slice(2, 7);
/** No. WA acak & valid (0812 + 8 digit). */
export const randomWa = () => "0812" + String(Math.floor(1e7 + Math.random() * 9e7));

export const card = (page: Page, name: string) => page.getByRole("button", { name: new RegExp(`^${name},`) });

// ---------- Akses API langsung (setup data & cek angka) ----------
// ponytail: PostgREST langsung (tanpa realtime supabase-js yang butuh WebSocket bawaan Node 22)
try { process.loadEnvFile(".env.local"); } catch {}
const SB = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const svcKey = process.env.SUPABASE_SECRET_KEY!;
/** Klien service role (melewati RLS) — hanya untuk menyiapkan/membersihkan data tes. */
export const admin = new PostgrestClient(`${SB}/rest/v1`, { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } });

/** Klien sebagai pengguna tim yang login (RLS & cek peran berlaku), mis. kasir memanggil checkout. */
export async function apiAs(who: keyof typeof USERS) {
  const pub = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  const r = await fetch(`${SB}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { apikey: pub, "Content-Type": "application/json" }, body: JSON.stringify({ email: USERS[who], password: PW }),
  });
  const { access_token } = await r.json();
  return new PostgrestClient(`${SB}/rest/v1`, { headers: { apikey: pub, Authorization: `Bearer ${access_token}` } });
}

/**
 * SQL langsung ke DB lokal (peran postgres) — hanya untuk menyiapkan/membersihkan data yang sengaja dikunci trigger
 * (mis. SOP yang sudah diotorisasi). Satu pernyataan; bungkus beberapa perintah dengan DO $$ … $$.
 */
export function sql<T = Record<string, unknown>>(q: string): T[] {
  const f = join(mkdtempSync(join(tmpdir(), "gb-sql-")), "q.sql");
  writeFileSync(f, q);
  const out = execFileSync("npx", ["supabase", "db", "query", "--local", "-f", f], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  const start = out.indexOf("{");
  return start < 0 ? [] : ((JSON.parse(out.slice(start)).rows ?? []) as T[]);
}
