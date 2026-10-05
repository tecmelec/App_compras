// Service worker de la Tienda Tecmelec: recibe las notificaciones push y,
// al tocarlas, abre la pantalla correspondiente de la app.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch (e) {
    datos = { cuerpo: event.data ? event.data.text() : '' };
  }
  const titulo = datos.titulo || 'Tienda Tecmelec';
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      tag: datos.tag || undefined,
      data: { url: datos.url || '/tienda' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destino = new URL((event.notification.data && event.notification.data.url) || '/tienda', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const v of ventanas) {
        if (v.url.startsWith(self.location.origin) && 'focus' in v) {
          v.navigate(destino);
          return v.focus();
        }
      }
      return self.clients.openWindow(destino);
    })
  );
});
