import { obtenerPedidoPorToken } from '@/app/actions/proveedor-fecha-entrega';
import FechaEntregaForm from './FechaEntregaForm';

function IconoCalendario({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

function IconoCamion() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="1" y="3" width="15" height="13" />
      <polygon points="16 8 20 8 23 11 23 16 16 16 16 8" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

export default async function PaginaFechaEntrega({ params }: { params: { token: string } }) {
  const resultado = await obtenerPedidoPorToken(params.token);

  return (
    <div className="min-h-screen bg-fondo flex items-start justify-center p-4 md:p-10">
      <div className="w-full max-w-xl bg-white border border-borde rounded-2xl shadow-sm overflow-hidden mt-6">
        <div className="relative px-6 md:px-8 pt-6 pb-5 border-b border-borde">
          <div className="absolute top-5 right-5 md:right-6 w-12 h-12 md:w-14 md:h-14 rounded-full bg-marcaClaro text-marca flex items-center justify-center shrink-0">
            <IconoCamion />
          </div>

          <p className="font-mono font-bold tracking-widest text-marcaOscuro text-sm mb-3">TECMELEC</p>

          <div className="flex items-center gap-3 pr-16">
            <span className="w-9 h-9 rounded-full bg-marcaClaro text-marca flex items-center justify-center shrink-0">
              <IconoCalendario />
            </span>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-grafito leading-tight">Fecha de entrega</h1>
              <p className="text-xs text-slate truncate">Indica la fecha de entrega estimada para tu pedido</p>
            </div>
          </div>
        </div>

        <div className="px-6 md:px-8 py-6">
          {'error' in resultado && (
            <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-4 py-3">
              {resultado.error}
            </p>
          )}

          {'success' in resultado && resultado.success && (
            <>
              <p className="text-sm text-slate mb-6">
                Pedido <span className="font-mono text-grafito">{resultado.numeroTecmelec}</span>
                {resultado.proveedorNombre ? ` — ${resultado.proveedorNombre}` : ''}
              </p>
              <FechaEntregaForm token={params.token} items={resultado.items!} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
