import Image from 'next/image';
import LoginForm from './LoginForm';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen bg-fondo">
      {/* ===== Layout móvil ===== */}
      <div className="md:hidden">
        <div className="relative w-full aspect-[1024/592]">
          <Image
            src="/login-mobile-top.png"
            alt="Tienda Tecmelec — Portal de solicitudes de material"
            fill
            priority
            className="object-cover"
          />
        </div>

        <div className="bg-white rounded-t-2xl shadow-lg relative z-10 px-6 py-8">
          <LoginForm error={searchParams.error} />
        </div>

        <div className="relative w-full aspect-[1024/298]">
          <Image
            src="/login-mobile-bottom.png"
            alt=""
            fill
            className="object-cover"
          />
        </div>
      </div>

      {/* ===== Layout escritorio (acotado, no se estira en pantallas grandes) ===== */}
      <div className="hidden md:flex min-h-screen items-center justify-center p-4 relative overflow-hidden">
        <svg
          className="absolute bottom-0 right-0 w-1/2 h-2/3 pointer-events-none"
          viewBox="0 0 400 300"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <polygon points="400,0 400,300 100,300" fill="#178A4C" opacity="0.12" />
          <polygon points="400,60 400,300 180,300" fill="#178A4C" opacity="0.18" />
        </svg>

        <div className="relative z-10 w-full max-w-5xl bg-white rounded-2xl shadow-lg overflow-hidden flex min-h-[600px] max-h-[820px]">
          <div className="hidden md:block md:w-1/2 relative shrink-0">
            <Image
              src="/login-bg.png"
              alt="Tienda Tecmelec — Portal de solicitudes de material"
              fill
              priority
              className="object-cover"
            />
          </div>

          <div className="flex-1 flex items-center justify-center px-6 py-10 sm:px-10">
            <div className="w-full max-w-sm">
              <LoginForm error={searchParams.error} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
