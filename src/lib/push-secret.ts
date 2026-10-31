import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Cek header x-push-secret dari trigger DB (pg_net) & cron — perbandingan waktu-konstan (audit SEC-6), panjang berbeda
 * tidak bocor karena yang dibandingkan hash-nya.
 */
export function pushSecretOk(header: string | null): boolean {
  const secret = process.env.PUSH_SECRET;
  if (!secret || !header) return false;
  const h = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(h(header), h(secret));
}
