import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import AltaArticulosClient, { type SolicitudAltaFila } from './AltaArticulosClient';

export default async function AltaArticulosPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
  const rol = perfil?.rol || '';
  if (!['comprador', 'responsable', 'admin'].includes(rol)) redirect('/tienda');
  const esAdmin = rol === 'admin';

  // El admin ve todas; el resto, las suyas (lo garantizan también los permisos de la base de datos).
  let consulta = supabase
    .from('solicitudes_alta_articulo')
    .select(
      'id, bc_item_no, descripcion, estado, created_at, gestionado_en, solicitante:profiles!solicitudes_alta_articulo_solicitado_por_fkey(nombre_completo)'
    )
    .order('created_at', { ascending: false });
  if (!esAdmin) consulta = consulta.eq('solicitado_por', user.id);
  const { data } = await consulta;

  const filas: SolicitudAltaFila[] = (data || []).map((s: any) => ({
    id: s.id,
    bc_item_no: s.bc_item_no,
    descripcion: s.descripcion,
    estado: s.estado,
    created_at: s.created_at,
    gestionado_en: s.gestionado_en,
    solicitante: s.solicitante?.nombre_completo || '—',
  }));

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Solicitar alta de artículos</h1>
      <p className="text-slate text-sm mb-6">
        {esAdmin
          ? 'Solicitudes de alta de artículos de Business Central en la tienda. Asigna el estado a cada una.'
          : 'Pide que se publique en la tienda un artículo de Business Central y sigue el estado de tus solicitudes.'}
      </p>
      <AltaArticulosClient filas={filas} esAdmin={esAdmin} />
    </div>
  );
}
