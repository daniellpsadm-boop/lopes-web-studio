self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", function (event) {
  event.waitUntil(
    (async function () {
      var data = {
        title: "Visita no site",
        body: "Alguém acabou de abrir a Lopes Web Studio.",
        url: "/",
      };
      try {
        if (event.data) Object.assign(data, event.data.json());
      } catch (e) {}

      var windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      windows.forEach(function (client) {
        client.postMessage({ type: "visit", payload: data });
      });

      var avisosVisible = windows.some(function (client) {
        return client.visibilityState === "visible" && /avisos\.html/i.test(client.url || "");
      });
      if (avisosVisible) return;

      await self.registration.showNotification(data.title, {
        body: data.body,
        icon: "imagens/logo-menu.webp",
        badge: "img/favicon/android-icon-192.png",
        lang: "pt-BR",
        data: { url: data.url || "/" },
      });
    })()
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (clientsArr) {
      for (var i = 0; i < clientsArr.length; i += 1) {
        if (clientsArr[i].url && "focus" in clientsArr[i]) return clientsArr[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
