/* Selbstzerstörungs-Service-Worker.
   Ersetzt den früheren Cache-Worker ('ladepark-v1'), der veraltete
   Seiten ausgeliefert hat. Sobald der Browser diese Datei abruft,
   werden alle Caches geleert, die Registrierung entfernt und alle
   offenen Tabs neu geladen — danach kommt immer die aktuelle Seite. */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    } catch (e) { /* ignorieren */ }
  })());
});

/* Kein fetch-Handler: nichts wird mehr aus dem Cache bedient. */
