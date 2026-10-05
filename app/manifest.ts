import type { MetadataRoute } from 'next';

// Permite instalar la Tienda en el móvil ("Añadir a pantalla de inicio") como
// una app: se abre a pantalla completa y puede recibir notificaciones push.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Tienda Tecmelec',
    short_name: 'Tecmelec',
    description: 'Plataforma interna de solicitud de materiales',
    start_url: '/tienda',
    scope: '/',
    display: 'standalone',
    background_color: '#F5F6F4',
    theme_color: '#0B3B26',
    lang: 'es',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
