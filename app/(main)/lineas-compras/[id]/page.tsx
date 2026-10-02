import { createClient } from '@/lib/supabase/server';
import DetalleSolicitud from '@/components/DetalleSolicitud';

// Detalle de una solicitud abierto desde "Líns. compras" (vista de consulta para Compras).
export default async function DetalleSolicitudLineasPage({ params }: { params: { id: string } }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user?.id).single();

  const enlaceGestion =
    perfil?.rol === 'comprador' ? `/comprador/${params.id}` : perfil?.rol === 'admin' ? `/admin/pedidos/${params.id}` : undefined;

  return (
    <DetalleSolicitud
      id={params.id}
      modo="consulta"
      volver={{ href: '/lineas-compras', texto: 'Volver a Líns. compras' }}
      enlaceGestion={enlaceGestion}
    />
  );
}
