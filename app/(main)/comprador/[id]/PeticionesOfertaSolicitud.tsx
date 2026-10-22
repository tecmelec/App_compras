import { createAdminClient } from '@/lib/supabase/admin';

// Peticiones de oferta enviadas desde "Proponer compra" → "Pedir ofertas" (registro en
// la solicitud). Si la migración 20261023130000 no está aplicada, no se muestra nada.
export default async function PeticionesOfertaSolicitud({ pedidoId }: { pedidoId: string }) {
  const { data } = await createAdminClient()
    .from('peticiones_oferta')
    .select('id, proveedor_nombre, destinatarios, lineas, sugerido, enviado_en, profiles!peticiones_oferta_enviado_por_fkey(nombre_completo)')
    .eq('pedido_id', pedidoId)
    .order('enviado_en', { ascending: false });
  if (!data || data.length === 0) return null;
  return (
    <section className="bg-white border border-borde rounded-lg p-4 mb-6">
      <h2 className="text-sm font-semibold text-grafito mb-2">
        Peticiones de oferta enviadas <span className="text-slate font-normal">({data.length})</span>
      </h2>
      <ul className="divide-y divide-borde">
        {data.map((p: any) => (
          <li key={p.id} className="py-2 text-sm">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-medium text-grafito">{p.proveedor_nombre}</span>
              {!p.sugerido && <span className="text-xs text-slate">(añadido a mano)</span>}
              <span className="text-xs text-slate">
                {new Date(p.enviado_en).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'short', timeStyle: 'short' })}
                {p.profiles?.nombre_completo ? ` · ${p.profiles.nombre_completo}` : ''} · {(p.destinatarios || []).join(', ')}
              </span>
            </div>
            <p className="text-xs text-slate mt-0.5">
              {(p.lineas || []).map((l: any) => l.articulo).join(' · ')}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
