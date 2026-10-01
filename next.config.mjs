/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
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
