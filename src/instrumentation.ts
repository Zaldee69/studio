import * as Sentry from "@sentry/nextjs";
import type { Instrumentation } from "next";
import { errInfo, log } from "@/lib/log";

// Semua error server yang tertangkap Next (render Server Component, route handler, server action, proxy).
// Query string dibuang — bisa berisi kode konfirmasi/token.
export function register() {
  // ponytail: hanya runtime Node; tambah init edge kalau nanti ada route edge.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0 });
  }
}

export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  Sentry.captureRequestError(err, request, context);
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  log("error", "request_error", {
    method: request.method, path: request.path.split("?")[0], route: context.routePath, type: context.routeType, digest, ...errInfo(err),
  });
};
