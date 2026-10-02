import type { Instrumentation } from "next";
import { errInfo, log } from "@/lib/log";

// Semua error server yang tertangkap Next (render Server Component, route handler, server action, proxy).
// Query string dibuang — bisa berisi kode konfirmasi/token.
export const onRequestError: Instrumentation.onRequestError = (err, request, context) => {
  const digest = typeof err === "object" && err !== null && "digest" in err ? String(err.digest) : undefined;
  log("error", "request_error", {
    method: request.method, path: request.path.split("?")[0], route: context.routePath, type: context.routeType, digest, ...errInfo(err),
  });
};
