"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

declare global {
  interface Window { turnstile?: { render: (el: HTMLElement, o: Record<string, unknown>) => string; remove: (id: string) => void } }
}

/** Widget Cloudflare Turnstile (hanya bila NEXT_PUBLIC_TURNSTILE_SITE_KEY diisi). Token divalidasi di server. */
export function Turnstile({ onToken }: { onToken: (t: string | null) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const el = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!window.turnstile);
  const cb = useRef(onToken);
  useEffect(() => { cb.current = onToken; });
  useEffect(() => {
    if (!siteKey || !ready || !el.current || !window.turnstile) return;
    const id = window.turnstile.render(el.current, {
      sitekey: siteKey, theme: "dark", language: "id",
      callback: (t: string) => cb.current(t), "expired-callback": () => cb.current(null), "error-callback": () => cb.current(null),
    });
    return () => window.turnstile?.remove(id);
  }, [siteKey, ready]);
  if (!siteKey) return null;
  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" onReady={() => setReady(true)} />
      <div ref={el} className="min-h-[65px]" />
    </>
  );
}

export const captchaOn = () => !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
