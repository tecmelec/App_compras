import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { notFound } from 'next/navigation';
import DetalleSolicitud from '@/components/DetalleSolicitud';

// Detalle de una solicitud abierto desde "Líns. compras" (vista de consulta para Compras).
export default async function DetalleSolicitudLineasPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user?.id).single();

  // Perfil usuario: puede consultar las solicitudes de los proyectos que tiene habilitados
  // (aunque no sean suyas); la RLS no se las deja leer, así que el detalle se carga con el
  // cliente admin tras comprobarlo aquí.
  let accesoPorProyecto = false;
  if (perfil?.rol === 'usuario') {
    const { data: ped } = await createAdminClient().from('pedidos').select('usuario_id, proyecto_id').eq('id', params.id).maybeSingle();
    if (!ped) notFound();
    if (ped.usuario_id !== user?.id) {
      const { data: asignado } = await supabase
        .from('usuario_proyectos')
        .select('proyecto_id')
        .eq('usuario_id', user!.id)
        .eq('proyecto_id', ped.proyecto_id)
        .maybeSingle();
      if (!asignado) notFound();
      accesoPorProyecto = true;
    }
  }

  const enlaceGestion =
    perfil?.rol === 'comprador'
      ? `/comprador/${params.id}`
      : perfil?.rol === 'admin'
        ? `/admin/pedidos/${params.id}`
        : perfil?.rol === 'responsable'
          ? `/responsable/${params.id}`
          : undefined;
  const textoGestion = perfil?.rol === 'responsable' ? 'Ver aprobación' : 'Gestionar solicitud';

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
