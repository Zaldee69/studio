// Service worker aplikasi kapster (scope /kapster): hanya untuk Web Push.
self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  event.waitUntil(self.registration.showNotification(d.title || "G&B Kapster", {
    body: d.body || "", tag: d.tag, renotify: true,
    icon: "/icons/kapster-192.png", badge: "/icons/kapster-192.png",
    data: { url: d.url || "/kapster" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/kapster";
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
    const w = wins.find((c) => new URL(c.url).pathname.startsWith("/kapster"));
    return w ? w.focus() : self.clients.openWindow(url);
  }));
});
