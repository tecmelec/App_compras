import Image from 'next/image';
import LoginForm from './LoginForm';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex bg-fondo relative overflow-hidden">
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

      {/* Panel izquierdo: imagen con texto ya incorporado (solo en pantallas medianas o más) */}
      <div className="hidden md:block md:w-1/2 lg:w-[55%] relative shrink-0">
        <Image src="/login-bg.png" alt="Tienda Tecmelec — Portal de solicitudes de material" fill priority className="object-cover" />
      </div>

      {/* Panel derecho: formulario real */}
      <div className="flex-1 flex items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-md">
          <div className="md:hidden text-center mb-6">
            <p className="logo-tecmelec text-2xl" style={{ color: '#178A4C', textShadow: 'none' }}>
              TECMELEC
            </p>
          </div>

          <LoginForm error={searchParams.error} />
        </div>
      </div>
    </div>
  );
}
