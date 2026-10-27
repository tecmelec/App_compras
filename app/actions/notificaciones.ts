'use server';

import { createClient } from '@/lib/supabase/server';
import { visibilidadLineas, puedeVerSolicitud } from '@/lib/visibilidad-lineas';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';

export async function marcarNotificacionLeida(id: string) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase
    .from('notificaciones')
    .update({ leido: true })
    .eq('id', id)
    .eq('usuario_id', user.id);

  if (error) return { error: 'No se pudo actualizar la notificación.' };
  return { success: true };
}

export async function marcarTodasNotificacionesLeidas() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase
    .from('notificaciones')
    .update({ leido: true })
    .eq('usuario_id', user.id)
    .eq('leido', false);

  if (error) return { error: 'No se pudieron actualizar las notificaciones.' };
  return { success: true };
}

// Activa/desactiva el seguimiento de un "Pedido Tecmelec" concreto dentro de
// una solicitud (una solicitud puede tener varios, uno por proveedor). Cada
// grupo se sigue de forma independiente. numeroTecmelec puede ser '' para el
// grupo de líneas aún sin asignar a un pedido Tecmelec.
// No se hace update directo sobre ninguna tabla: se usa una función RPC
// security definer que valida que el pedido sea del usuario antes de tocar
// nada, para no poder cambiar otros campos desde el cliente.
export async function actualizarSeguirPedido(
  pedidoId: string,
  numeroTecmelec: string,
  seguir: boolean
) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  // Quien no es el solicitante también puede seguir el pedido si puede ver la
  // solicitud (comprador/admin siempre; usuario/responsable según su visibilidad en
  // Líns. compras). Se guarda en seguidores_pedido_tecmelec.
  const admin = createAdminClient();
  const { data: ped } = await admin
    .from('pedidos')
    .select('usuario_id, proyecto_id, responsable_id')
    .eq('id', pedidoId)
    .maybeSingle();
  if (!ped) return { error: 'Solicitud no encontrada.' };
  if (ped.usuario_id !== user.id) {
    const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
    if (!perfil?.activo) return { error: 'No autorizado.' };
    if (perfil.rol === 'usuario' || perfil.rol === 'responsable' || perfil.rol === 'integral') {
      const v = await visibilidadLineas(user.id, perfil.rol);
      if (!puedeVerSolicitud(v, user.id, ped)) return { error: 'No autorizado.' };
    }
    const clave = numeroTecmelec || '__sin_asignar__';
    const { error: errorSeg } = seguir
      ? await admin
          .from('seguidores_pedido_tecmelec')
          .upsert({ pedido_id: pedidoId, numero_tecmelec: clave, usuario_id: user.id }, { onConflict: 'pedido_id,numero_tecmelec,usuario_id', ignoreDuplicates: true })
      : await admin
          .from('seguidores_pedido_tecmelec')
          .delete()
          .eq('pedido_id', pedidoId)
          .eq('numero_tecmelec', clave)
          .eq('usuario_id', user.id);
    if (errorSeg) return { error: 'No se pudo actualizar el seguimiento del pedido.' };
    revalidatePath(`/lineas-compras/${pedidoId}`);
    return { success: true };
  }

  const { error } = await supabase.rpc('set_seguir_pedido_tecmelec', {
    p_pedido_id: pedidoId,
    p_numero_tecmelec: numeroTecmelec,
    p_activo: seguir,
  });

  if (error) return { error: 'No se pudo actualizar el seguimiento del pedido.' };

  revalidatePath(`/mis-pedidos/${pedidoId}`);
  return { success: true };
}
