import { login } from './actions';

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string };
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-fondo px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="text-sm font-medium tracking-wide text-acero">TECMELEC</p>
          <h1 className="text-2xl font-semibold text-grafito mt-1">Solicitud de materiales</h1>
        </div>

        <form action={login} className="bg-white border border-borde rounded-lg p-6 space-y-4">
          {searchParams.error && (
            <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">
              {searchParams.error}
            </p>
          )}

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-grafito mb-1">
              Usuario
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="input"
              placeholder="nombre@tecmelec.com"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-grafito mb-1">
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="input"
            />
          </div>

          <button type="submit" className="btn-primary w-full">
            Entrar
          </button>

          <p className="text-xs text-slate text-center pt-2">
            ¿No tienes acceso? Contacta al administrador para que te cree una cuenta.
          </p>
        </form>
      </div>
    </div>
  );
}
