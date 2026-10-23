/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Las imágenes de productos se sirven tal cual desde Supabase Storage, sin pasar por
    // la optimización de imágenes de Vercel: en el plan Hobby tiene un cupo mensual y,
    // al agotarse, las imágenes que no estaban ya en caché (p. ej. los tamaños que pide
    // el móvil) dejan de cargarse.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
    ],
  },
  // pdfkit (usado por @react-pdf/renderer) carga sus fuentes estándar con un
  // require dinámico que el rastreo automático de Vercel no detecta; sin esto
  // el bundle serverless no incluye esos archivos y el PDF falla en producción.
  experimental: {
    // Para poder enviar documentos adjuntos en el email del pedido (hasta ~3 MB
    // en base64 + el resto de datos). El valor por defecto de Next es 1 MB.
    serverActions: {
      bodySizeLimit: '5mb',
    },
    outputFileTracingIncludes: {
      '/api/pedidos/[numeroTecmelec]/pdf': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
    },
  },
};

export default nextConfig;
