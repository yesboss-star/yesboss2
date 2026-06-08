self.addEventListener("push", function (event) {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: "YESBOSS", message: event.data ? event.data.text() : "" };
  }

  const title = data.title || "YESBOSS";
  const options = {
    body: data.message || "",
    icon: "/icon.png",
    badge: "/badge.png",
    data: {
      link: data.link || "/dashboard/notifications",
      notification_id: data.notification_id || "",
    },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const link = event.notification.data?.link || "/dashboard/notifications";
  event.waitUntil(clients.openWindow(link));
});
