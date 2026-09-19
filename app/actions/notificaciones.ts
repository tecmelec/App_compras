'use server';

import { createClient } from '@/lib/supabase/server';
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

  const { error } = await supabase.rpc('set_seguir_pedido_tecmelec', {
    p_pedido_id: pedidoId,
    p_numero_tecmelec: numeroTecmelec,
    p_activo: seguir,
  });

  if (error) return { error: 'No se pudo actualizar el seguimiento del pedido.' };

  revalidatePath(`/mis-pedidos/${pedidoId}`);
  return { success: true };
}
