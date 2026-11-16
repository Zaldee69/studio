import * as Sentry from "@sentry/nextjs";

// DSN publik; kosong = Sentry mati (dev/test). Tanpa replay & tracing: hemat kuota, cukup tangkap error.
Sentry.init({ dsn: process.env.NEXT_PUBLIC_SENTRY_DSN, tracesSampleRate: 0 });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
