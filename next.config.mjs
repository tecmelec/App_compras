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
    outputFileTracingIncludes: {
      '/api/pedidos/[numeroTecmelec]/pdf': ['./node_modules/pdfkit/js/standard-fonts/**/*'],
    },
  },
};

export default nextConfig;
