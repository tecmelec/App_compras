import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerTodosLosProveedores } from '@/lib/proveedores-utils';
import CondicionesClient from './CondicionesClient';

// Administración → Condiciones comerciales: % de pronto pago y rappel por proveedor
// (se aplican al generar el comparativo de ofertas).
export default async function CondicionesComercialesPage() {
  const admin = createAdminClient();
  const [{ data: condiciones, error }, { data: proveedores }] = await Promise.all([
    admin.from('condiciones_proveedor').select('proveedor_id, pronto_pago_pct, rappel_pct, notas, updated_at, proveedores(bc_proveedor_no, nombre)'),
    obtenerTodosLosProveedores(admin),
  ]);
  return (
    <div className="p-8 max-w-4xl">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Condiciones comerciales</h1>
      <p className="text-slate text-sm mb-6">
        Porcentaje de pronto pago y de rappel que tenéis con cada proveedor. Se aplican al generar el comparativo de ofertas desde una
        solicitud (precio neto = precio × (1 − pronto pago) × (1 − rappel)).
      </p>
      {error ? (
        <p className="text-sm text-rojo">Falta aplicar la migración de condiciones comerciales (20261023150000) en la base de datos.</p>
      ) : (
        <CondicionesClient
          proveedores={(proveedores as any[]) || []}
          condiciones={(condiciones || []).map((c: any) => ({
            proveedorId: c.proveedor_id,
            proveedorNo: c.proveedores?.bc_proveedor_no || '',
            proveedorNombre: c.proveedores?.nombre || '',
            prontoPago: Number(c.pronto_pago_pct),
            rappel: Number(c.rappel_pct),
            notas: c.notas || '',
          }))}
        />
      )}
    </div>
  );
}
