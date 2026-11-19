"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (
    <html lang="id"><body style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1>Terjadi kesalahan</h1>
      <p>Muat ulang halaman. Kalau terus begini, hubungi manajer.</p>
    </body></html>
  );
}
