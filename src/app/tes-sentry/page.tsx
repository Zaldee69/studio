"use client";

// SEMENTARA: hapus folder ini + src/app/api/tes-sentry setelah error muncul di Sentry.
export default function TesSentry() {
  return (
    <main style={{ padding: 24, display: "grid", gap: 12, fontFamily: "sans-serif" }}>
      <button onClick={() => { throw new Error("Tes Sentry: error client"); }}>Error client</button>
      <button onClick={() => fetch("/api/tes-sentry")}>Error server</button>
    </main>
  );
}
