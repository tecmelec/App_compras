import { createAdminClient } from '@/lib/supabase/admin';
import PeticionesOfertaCliente from './PeticionesOfertaCliente';

// Peticiones de oferta enviadas desde "Proponer compra" → "Pedir ofertas" (registro en
// la solicitud), con las respuestas de los proveedores. Si la migración 20261023130000
// no está aplicada, no se muestra nada.
export default async function PeticionesOfertaSolicitud({
  pedidoId,
  proveedores,
  preciosActuales,
}: {
  pedidoId: string;
  proveedores: { id: string; bc_proveedor_no: string; nombre: string | null }[];
  preciosActuales: { id: string; precio: number }[];
}) {
  const { data } = await createAdminClient()
    .from('peticiones_oferta')
    .select('id, proveedor_id, proveedor_nombre, destinatarios, lineas, sugerido, enviado_en, profiles!peticiones_oferta_enviado_por_fkey(nombre_completo)')
    .eq('pedido_id', pedidoId)
    .order('enviado_en', { ascending: false });
  if (!data || data.length === 0) return null;
  return (
    <PeticionesOfertaCliente
      pedidoId={pedidoId}
      proveedores={proveedores}
      preciosActuales={preciosActuales}
      peticiones={data.map((p: any) => ({
        id: p.id,
        proveedor_id: p.proveedor_id,
        proveedor_nombre: p.proveedor_nombre,
        destinatarios: p.destinatarios || [],
        lineas: p.lineas || [],
        sugerido: p.sugerido,
        enviado_en: p.enviado_en,
        enviadoPor: p.profiles?.nombre_completo || null,
      }))}
    />
  );
}
