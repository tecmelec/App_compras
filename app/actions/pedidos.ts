'use server';

import { createClient } from '@/lib/supabase/server';
import { enviarEmailSolicitud } from '@/lib/email';

type ItemInput = { producto_id: string; nombre: string; cantidad: number };

type DatosSolicitud = {
  nombre_contacto: string;
  telefono_contacto: string;
  direccion_entrega_id: string;
  fecha_requerida: string;
  comprador_id?: string | null;
};

export async function crearPedido(items: ItemInput[], datos: DatosSolicitud) {
  if (items.length === 0) {
    return { error: 'El carrito está vacío.' };
  }

  if (!datos.nombre_contacto || !datos.telefono_contacto) {
    return { error: 'Falta el nombre o el teléfono de contacto.' };
  }

  if (!datos.direccion_entrega_id) {
    return { error: 'Selecciona una dirección de entrega.' };
  }

  if (!datos.fecha_requerida) {
    return { error: 'Selecciona la fecha requerida de entrega.' };
  }

  const fecha = new Date(datos.fecha_requerida + 'T00:00:00');
  const diaSemana = fecha.getDay(); // 0 = domingo, 6 = sábado
  if (diaSemana === 0 || diaSemana === 6) {
    return { error: 'La fecha requerida no puede ser sábado ni domingo.' };
  }

  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  if (fecha <= hoy) {
    return { error: 'La fecha requerida debe ser posterior a hoy.' };
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
    .select('nombre_completo, rol, comprador_id, responsable_id')
    .eq('id', user.id)
    .single();

  if (!perfil) {
    return { error: 'No se encontró tu perfil de usuario.' };
  }

  // El usuario normal siempre usa su comprador/responsable asignado.
  // Admin y responsable eligen el comprador manualmente al solicitar (no tienen uno fijo).
  const puedeElegirComprador = perfil.rol === 'admin' || perfil.rol === 'responsable';
  const compradorFinal = puedeElegirComprador ? datos.comprador_id || null : perfil.comprador_id;

  if (puedeElegirComprador && !compradorFinal) {
    return { error: 'Selecciona un comprador para esta solicitud.' };
  }

  // 1. Calcular el total real a partir de los precios guardados en la base (nunca confiar en el precio del cliente)
  const idsProductos = items.map((i) => i.producto_id);
  const { data: productosDb } = await supabase
    .from('productos')
    .select('id, precio')
    .in('id', idsProductos);

  const precios = new Map((productosDb || []).map((p) => [p.id, p.precio]));
  const totalEstimado = items.reduce(
    (suma, item) => suma + (precios.get(item.producto_id) || 0) * item.cantidad,
    0
  );

  // 2. Determinar si supera el límite de aprobación automática
  const { data: config } = await supabase
    .from('configuracion')
    .select('limite_aprobacion')
    .eq('id', 1)
    .single();

  const limite = config?.limite_aprobacion ?? 200;
  // Admin y responsable no necesitan aprobación de nadie, sin importar el monto.
  const requiereAprobacion = puedeElegirComprador ? false : totalEstimado > limite;

  // 3. Crear el pedido
  const { data: pedido, error: errorPedido } = await supabase
    .from('pedidos')
    .insert({
      usuario_id: user.id,
      comprador_id: compradorFinal,
      responsable_id: perfil.responsable_id,
      nombre_contacto: datos.nombre_contacto,
      telefono_contacto: datos.telefono_contacto,
      direccion_entrega_id: datos.direccion_entrega_id,
      fecha_requerida: datos.fecha_requerida,
      total_estimado: totalEstimado,
      requiere_aprobacion: requiereAprobacion,
      aprobado: requiereAprobacion ? null : true,
    })
    .select('id, numero_app')
    .single();

  if (errorPedido || !pedido) {
    return { error: 'No se pudo crear el pedido. Intenta nuevamente.' };
  }

  // 4. Crear las líneas del pedido
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

  // 5. Obtener emails del comprador y responsable asignados
  const idsDestino = [compradorFinal, perfil.responsable_id].filter(Boolean) as string[];
  let destinatarios: string[] = [];

  if (idsDestino.length > 0) {
    const { data: contactos } = await supabase
      .from('profiles')
      .select('email')
      .in('id', idsDestino);
    destinatarios = (contactos || []).map((c) => c.email);
  }

  // 6. Enviar email (si falla, no revertimos el pedido; solo lo reportamos)
  try {
    await enviarEmailSolicitud({
      destinatarios,
      solicitante: perfil.nombre_completo,
      numeroApp: pedido.numero_app,
      items: items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad })),
      requiereAprobacion,
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

export async function responderAprobacion(pedidoId: string, aprobado: boolean) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { error: 'Debes iniciar sesión.' };

  const { error } = await supabase
    .from('pedidos')
    .update({
      aprobado,
      aprobado_por: user.id,
      aprobado_en: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', pedidoId);

  if (error) return { error: 'No se pudo registrar la decisión.' };

  return { success: true };
}
