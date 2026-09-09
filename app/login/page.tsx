import Image from 'next/image';
import LoginForm from './LoginForm';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-fondo p-4 relative overflow-hidden">
      {/* Corte diagonal decorativo, igual que el resto de la app */}
      <svg
        className="absolute bottom-0 right-0 w-1/2 h-2/3 pointer-events-none"
        viewBox="0 0 400 300"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polygon points="400,0 400,300 100,300" fill="#178A4C" opacity="0.12" />
        <polygon points="400,60 400,300 180,300" fill="#178A4C" opacity="0.18" />
      </svg>

      {/* Composición acotada: no se estira a lo ancho de pantallas muy grandes */}
      <div className="relative z-10 w-full max-w-5xl bg-white rounded-2xl shadow-lg overflow-hidden flex min-h-[600px] max-h-[820px]">
        {/* Panel izquierdo: imagen con texto ya incorporado (solo en pantallas medianas o más) */}
        <div className="hidden md:block md:w-1/2 relative shrink-0">
          <Image
            src="/login-bg.png"
            alt="Tienda Tecmelec — Portal de solicitudes de material"
            fill
            priority
            className="object-cover"
          />
        </div>

        {/* Panel derecho: formulario real */}
        <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-sm">
            <div className="md:hidden text-center mb-6">
              <p className="logo-tecmelec text-2xl" style={{ color: '#178A4C', textShadow: 'none' }}>
                TECMELEC
              </p>
            </div>

            <LoginForm error={searchParams.error} />
          </div>
        </div>
      </div>
    </div>
  );
}
