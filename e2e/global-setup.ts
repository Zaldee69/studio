import { execSync } from "node:child_process";

export default function globalSetup() {
  if (process.env.E2E_SKIP_RESET) return;
  execSync("npx supabase db reset", { stdio: "inherit" });
  execSync("sleep 3"); // tunggu container auth/realtime siap setelah restart
}
