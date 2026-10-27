import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import DetalleSolicitud from '@/components/DetalleSolicitud';
import { visibilidadLineas, puedeVerSolicitud } from '@/lib/visibilidad-lineas';

// Detalle de una solicitud abierto desde "Líns. compras" (vista de consulta para Compras).
export default async function DetalleSolicitudLineasPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user?.id).single();

  // Perfil usuario o responsable: puede consultar las solicitudes que le deja ver
  // Líns. compras (sus proyectos, las que aprueba, los proyectos de consulta o todos;
  // lib/visibilidad-lineas.ts). La RLS no le deja leer las ajenas, así que el detalle se
  // carga con el cliente admin tras comprobarlo aquí.
  let accesoPorProyecto = false;
  let aprueba = false;
  let propia = false;
  if (perfil?.rol === 'usuario' || perfil?.rol === 'responsable' || perfil?.rol === 'integral') {
    const { data: ped } = await createAdminClient()
      .from('pedidos')
      .select('usuario_id, proyecto_id, responsable_id, comprador_id')
      .eq('id', params.id)
      .maybeSingle();
    if (!ped) notFound();
    const visibilidad = await visibilidadLineas(user!.id, perfil.rol);
    if (!puedeVerSolicitud(visibilidad, user!.id, ped)) notFound();
    aprueba = !!ped.responsable_id && visibilidad.responsableIds.includes(ped.responsable_id);
    propia = ped.usuario_id === user!.id || (ped as any).comprador_id === user!.id;
    accesoPorProyecto = ped.usuario_id !== user!.id;
  }

  // El enlace a la vista de aprobación solo si la solicitud es de las que aprueba.
  // Enlace a la gestión: comprador/admin → vista de compras; responsable → aprobación (si
  // la aprueba); integral → vista de compras si es suya, o aprobación si la aprueba.
  const enlaceGestion =
    perfil?.rol === 'comprador' || (perfil?.rol === 'integral' && propia)
      ? `/comprador/${params.id}`
      : perfil?.rol === 'admin'
        ? `/admin/pedidos/${params.id}`
        : (perfil?.rol === 'responsable' || perfil?.rol === 'integral') && aprueba
          ? `/responsable/${params.id}`
          : undefined;
  const textoGestion = enlaceGestion?.startsWith('/responsable') ? 'Ver aprobación' : 'Gestionar solicitud';

  return (
    <DetalleSolicitud
      id={params.id}
      modo="consulta"
      volver={{ href: '/lineas-compras', texto: 'Volver a Líns. compras' }}
      enlaceGestion={enlaceGestion}
      textoGestion={textoGestion}
      accesoPorProyecto={accesoPorProyecto}
    />
  );
}
