self.addEventListener("notificationclick", (event) => {
  const action = event.action || "open";
  event.notification.close();
  event.waitUntil((async () => {
    const destination = new URL("/", self.location.origin);
    destination.searchParams.set("timerAction", action);
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const client = windows.find((window) => window.url.startsWith(self.location.origin));
    if (client) {
      await client.navigate(destination.toString());
      return client.focus();
    }
    return self.clients.openWindow(destination.toString());
  })());
});
