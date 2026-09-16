import { obtenerPedidoPorToken } from '@/app/actions/proveedor-fecha-entrega';
import FechaEntregaForm from './FechaEntregaForm';

export default async function PaginaFechaEntrega({ params }: { params: { token: string } }) {
  const resultado = await obtenerPedidoPorToken(params.token);

  return (
    <div className="min-h-screen bg-fondo flex items-start justify-center p-4 md:p-10">
      <div className="w-full max-w-xl bg-white border border-borde rounded-xl shadow-sm p-6 md:p-8 mt-6">
        <h1 className="text-lg font-semibold text-grafito mb-1">TECMELEC</h1>

        {'error' in resultado && (
          <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-4 py-3 mt-4">
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
  );
}
