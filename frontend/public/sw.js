self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(clients.claim()));

self.addEventListener("push", (event) => {
  const data = event.data?.json() || {};
  const title = data.title || "YesBoss";
  const options = {
    body: data.body || "",
    icon: data.icon || "/favicon.ico",
    badge: data.badge || "/favicon.ico",
    data: data.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/dashboard";
  event.waitUntil(clients.openWindow(url));
});

// Chrome only offers "Install app" when the service worker answers fetches. This one deliberately caches nothing and
// just lets every request go to the network, so a screen or an answer from one company can never be kept and shown
// to somebody else.
self.addEventListener("fetch", () => {});
