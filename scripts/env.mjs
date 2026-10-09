// Jalankan perintah dengan lingkungan lokal atau produksi: node scripts/env.mjs <local|prod> <perintah...>
//   local → .env.local (Supabase lokal di Docker)
//   prod  → rahasia dibaca dari Keychain macOS (layanan "dpras-prod", satu item per variabel) — tidak tersimpan di
//           file proyek. Belum dipindahkan? → .env.prod (file biasa, dengan peringatan).
//   node scripts/env.mjs simpan-keychain → salin isi .env.prod ke Keychain (lalu .env.prod boleh dihapus)
// Build/dev produksi memakai folder .next-prod agar cache (NEXT_PUBLIC_* tertanam di bundle) tidak tercampur.
import { execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const SERVICE = "dpras-prod";
const KEYS = ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_JWKS_URL",
  "SUPABASE_DB_PASSWORD", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "VAPID_SUBJECT", "PUSH_SECRET"];

const keychain = (key) => {
  try {
    return execFileSync("security", ["find-generic-password", "-s", SERVICE, "-a", key, "-w"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trimEnd();
  } catch { return null; }
};

const [target, ...cmd] = process.argv.slice(2);

if (target === "simpan-keychain") {
  if (!existsSync(".env.prod")) { console.error("Tidak ada .env.prod untuk dipindahkan."); process.exit(1); }
  const env = Object.fromEntries(readFileSync(".env.prod", "utf8").split("\n")
    .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean)
    .map(([, k, v]) => [k, v.replace(/^(['"])(.*)\1$/, "$2")]));
  for (const [k, v] of Object.entries(env)) {
    if (!v) continue;
    // -U: perbarui bila sudah ada. Nilai lewat argumen proses lokal (tidak ditulis ke disk/log).
    execFileSync("security", ["add-generic-password", "-U", "-s", SERVICE, "-a", k, "-w", v]);
    console.log(`✓ ${k}`);
  }
  console.log(`\nTersimpan di Keychain (layanan "${SERVICE}"). Cek di aplikasi Keychain Access, lalu hapus .env.prod.`);
  process.exit(0);
}

if (!["local", "prod"].includes(target) || !cmd.length) {
  console.error("Pakai: node scripts/env.mjs <local|prod> <perintah...>   atau   node scripts/env.mjs simpan-keychain");
  process.exit(1);
}
// ponytail: penjaga minimal — reset DB produksi tidak pernah lewat skrip ini
if (target === "prod" && cmd.includes("reset")) {
  console.error("Ditolak: reset database PRODUKSI tidak boleh dijalankan dari skrip ini.");
  process.exit(1);
}

let source = ".env.local";
if (target === "prod") {
  const found = Object.fromEntries(KEYS.map((k) => [k, keychain(k)]).filter(([, v]) => v !== null));
  if (found.NEXT_PUBLIC_SUPABASE_URL) {
    Object.assign(process.env, found);
    source = "Keychain";
  } else if (existsSync(".env.prod")) {
    process.loadEnvFile(".env.prod");
    source = ".env.prod";
    console.warn("\x1b[33mPeringatan: rahasia produksi dibaca dari file biasa (.env.prod). Pindahkan: npm run env:keychain\x1b[0m");
  } else {
    console.error(`Rahasia produksi belum ada di Keychain (layanan "${SERVICE}") maupun .env.prod. Lihat README → "Rahasia produksi".`);
    process.exit(1);
  }
  process.env.NEXT_DIST_DIR = ".next-prod";
} else {
  if (!existsSync(".env.local")) { console.error("File .env.local tidak ada."); process.exit(1); }
  process.loadEnvFile(".env.local");
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "?";
console.log(target === "prod"
  ? `\x1b[41m\x1b[97m PRODUKSI \x1b[0m ${url} · dari ${source} — perubahan mengenai data asli`
  : `\x1b[42m\x1b[30m LOKAL \x1b[0m ${url}`);
console.log(`$ ${cmd.join(" ")}\n`);

const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit", shell: process.platform === "win32" });
child.on("exit", (code) => process.exit(code ?? 1));
