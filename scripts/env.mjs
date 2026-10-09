// Jalankan perintah dengan lingkungan lokal atau produksi: node scripts/env.mjs <local|prod> <perintah...>
//   local → .env.local (Supabase lokal di Docker)        prod → .env.prod (Supabase cloud)
// Build/dev produksi memakai folder .next-prod agar cache (NEXT_PUBLIC_* tertanam di bundle) tidak tercampur.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";

const [target, ...cmd] = process.argv.slice(2);
const file = { local: ".env.local", prod: ".env.prod" }[target];
if (!file || !cmd.length) {
  console.error("Pakai: node scripts/env.mjs <local|prod> <perintah...>");
  process.exit(1);
}
if (!existsSync(file)) {
  console.error(`File ${file} tidak ada.`);
  process.exit(1);
}
// ponytail: penjaga minimal — reset DB produksi tidak pernah lewat skrip ini
if (target === "prod" && cmd.includes("reset")) {
  console.error("Ditolak: reset database PRODUKSI tidak boleh dijalankan dari skrip ini.");
  process.exit(1);
}

process.loadEnvFile(file); // nilai di file menimpa env shell untuk proses ini saja
if (target === "prod") process.env.NEXT_DIST_DIR = ".next-prod";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "?";
const banner = target === "prod"
  ? `\x1b[41m\x1b[97m PRODUKSI \x1b[0m ${url} — perubahan mengenai data asli`
  : `\x1b[42m\x1b[30m LOKAL \x1b[0m ${url}`;
console.log(`${banner}\n$ ${cmd.join(" ")}\n`);

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 1));
