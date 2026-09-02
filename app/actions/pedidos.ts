'use server';

import { createClient } from '@/lib/supabase/server';
import { enviarEmailSolicitud } from '@/lib/email';

type ItemInput = { producto_id: string; nombre: string; cantidad: number };

export async function crearPedido(items: ItemInput[]) {
  if (items.length === 0) {
    return { error: 'El carrito está vacío.' };
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: 'Debes iniciar sesión.' };
  }

  const { data: perfil } = await supabase
    .from('profiles')
    .select('nombre_completo, comprador_id, responsable_id')
    .eq('id', user.id)
    .single();

  if (!perfil) {
    return { error: 'No se encontró tu perfil de usuario.' };
  }

  // 1. Crear el pedido
  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      usuario_id: user.id,
      comprador_id: perfil.comprador_id,
      responsable_id: perfil.responsable_id,
    })
    .select('id, numero_app')
    .single();

  if (errorPedido || !pedido) {
    return { error: 'No se pudo crear el pedido. Intenta nuevamente.' };
  }

  // 2. Crear las líneas del pedido
  const { error: errorItems } = await supabase.from('pedido_items').insert(
    items.map((i) => ({
      pedido_id: pedido.id,
      producto_id: i.producto_id,
      cantidad: i.cantidad,
    }))
  );

  if (errorItems) {
    return { error: 'El pedido se creó pero hubo un problema guardando los artículos.' };
  }

  // 3. Obtener emails del comprador y responsable asignados
  const idsDestino = [perfil.comprador_id, perfil.responsable_id].filter(Boolean) as string[];
  let destinatarios: string[] = [];

  if (idsDestino.length > 0) {
    const { data: contactos } = await supabase
      .from('profiles')
      .select('email')
      .in('id', idsDestino);
    destinatarios = (contactos || []).map((c) => c.email);
  }

  // 4. Enviar email (si falla, no revertimos el pedido; solo lo reportamos)
  try {
    await enviarEmailSolicitud({
      destinatarios,
      solicitante: perfil.nombre_completo,
      numeroApp: pedido.numero_app,
      items: items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad })),
    });
  } catch (e) {
    console.error('Error enviando email de solicitud:', e);
  }

  return { success: true, numeroApp: pedido.numero_app };
}

export async function actualizarPedido(
  pedidoId: string,
  datos: { numero_tecmelec: string; estado_id: number; fecha_estimada_entrega: string | null }
) {
  const supabase = createClient();

  const { error } = await supabase
    .from('pedidos')
    .update({
      numero_tecmelec: datos.numero_tecmelec || null,
      estado_id: datos.estado_id,
      fecha_estimada_entrega: datos.fecha_estimada_entrega || null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId);

  if (error) {
    return { error: 'No se pudo actualizar el pedido.' };
  }

  return { success: true };
}
