import CerrarSesionBoton from './CerrarSesionBoton';

// Página para cuentas que existen pero no tienen perfil en la Tienda (p. ej.
// usuarios del CRM a los que se les ha quitado el acceso a la Tienda).
export default function SinAccesoPage() {
  return (
    <div className="min-h-screen bg-fondo flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white border border-borde rounded-2xl p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-grafito mb-2">Sin acceso a la Tienda Tecmelec</h1>
        <p className="text-sm text-slate mb-6">
          Tu usuario no tiene acceso a la Tienda o ha sido desactivado. Si crees que es un error, contacta con el administrador.
        </p>
        <CerrarSesionBoton />
      </div>
    </div>
  );
}
