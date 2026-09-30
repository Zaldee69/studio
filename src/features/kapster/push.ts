"use client";

import { createClient } from "@/lib/supabase/client";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function b64ToBytes(b64: string) {
  const s = atob((b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!VAPID;

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/kapster" });
}

export async function pushEnabled(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/kapster");
  return !!(await reg?.pushManager.getSubscription());
}

/** Aktifkan Web Push: izin → langganan → simpan ke server. Mengembalikan pesan error atau null. */
export async function enablePush(): Promise<string | null> {
  if (!pushSupported()) return "Perangkat/browser ini belum mendukung notifikasi push. Di iPhone: pasang aplikasi ke layar utama dulu (iOS 16.4+).";
  const perm = await Notification.requestPermission();
  if (perm !== "granted") return "Izin notifikasi ditolak. Aktifkan lewat pengaturan browser.";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID) });
  const j = sub.toJSON();
  const { error } = await createClient().rpc("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: j.keys!.p256dh, p_auth: j.keys!.auth });
  return error ? error.message : null;
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration("/kapster");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await createClient().from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
  await sub.unsubscribe();
}
