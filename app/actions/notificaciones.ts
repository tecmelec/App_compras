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

// Activa/desactiva el seguimiento de una solicitud (recibir notificaciones cuando
// cambie el estado de los pedidos Tecmelec asociados). Solo el propio solicitante
// puede cambiarlo.
export async function actualizarSeguirPedido(pedidoId: string, seguir: boolean) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase
    .from('pedidos')
    .update({ seguir_pedido: seguir })
    .eq('id', pedidoId)
    .eq('usuario_id', user.id);

  if (error) return { error: 'No se pudo actualizar el seguimiento del pedido.' };

  revalidatePath(`/mis-pedidos/${pedidoId}`);
  return { success: true };
}
