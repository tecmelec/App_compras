import { createClient } from '@/lib/supabase/server';
import SincronizarProveedoresBoton from './SincronizarProveedoresBoton';

export default async function ProveedoresAdminPage() {
  const supabase = createClient();

  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('id, bc_proveedor_no, nombre')
    .order('bc_proveedor_no');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Proveedores</h1>
      <p className="text-slate text-sm mb-6">
        Proveedores sincronizados desde Business Central, para asignarlos a cada línea de pedido.
      </p>

      <SincronizarProveedoresBoton />

      {!proveedores || proveedores.length === 0 ? (
        <p className="text-slate text-sm">Todavía no hay proveedores sincronizados.</p>
      ) : (
        <div className="bg-white border border-borde rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nº</th>
                <th className="px-4 py-3 font-medium">Nombre</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {proveedores.map((p) => (
                <tr key={p.id} className="hover:bg-fondo">
                  <td className="px-4 py-3 font-mono text-grafito">{p.bc_proveedor_no}</td>
                  <td className="px-4 py-3 text-grafito">{p.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
