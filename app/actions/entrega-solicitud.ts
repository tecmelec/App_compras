'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Editar el contacto y la dirección de entrega de una solicitud desde la vista del
// comprador. La dirección nueva se guarda como una dirección oculta del solicitante
// (como hace la "Predet." al crear la solicitud), para no modificar las direcciones que
// tenga guardadas ni otras solicitudes que las usen.

async function comprobarCompras() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || !['comprador', 'admin', 'integral'].includes(perfil.rol)) return null;
  return supabase;
}

export type OpcionDireccion = {
  id: string | null; // null = dirección predeterminada del proyecto (se crea al guardar)
  etiqueta: string;
  direccion: string;
  codigo_postal: string | null;
  ciudad: string | null;
  provincia: string | null;
};

export async function opcionesEntregaSolicitud(pedidoId: string) {
  const supabase = await comprobarCompras();
  if (!supabase) return { error: 'No autorizado.' };
  const { data: pedido } = await supabase
    .from('pedidos')
    .select('id, usuario_id, proyectos(direccion, codigo_postal, ciudad, provincia)')
    .eq('id', pedidoId)
    .single();
  if (!pedido) return { error: 'No se encontró la solicitud.' };

  const admin = createAdminClient();
  const [{ data: dirs }, { data: contactos }, { data: items }] = await Promise.all([
    admin
      .from('direcciones')
      .select('id, alias, direccion, codigo_postal, ciudad, provincia')
      .eq('usuario_id', pedido.usuario_id)
      .eq('oculta', false)
      .order('created_at', { ascending: false }),
    admin.from('contactos_entrega').select('id, nombre, telefono').eq('usuario_id', pedido.usuario_id).order('nombre'),
    admin.from('pedido_items').select('numero_tecmelec').eq('pedido_id', pedidoId),
  ]);

  const opciones: OpcionDireccion[] = [];
  const proy = (pedido as any).proyectos;
  if (proy?.direccion) {
    opciones.push({
      id: null,
      etiqueta: 'Predet. (dirección del proyecto)',
      direccion: proy.direccion,
      codigo_postal: proy.codigo_postal,
      ciudad: proy.ciudad,
      provincia: proy.provincia,
    });
  }
  for (const d of dirs || []) {
    opciones.push({
      id: d.id,
      etiqueta: d.alias,
      direccion: d.direccion,
      codigo_postal: d.codigo_postal,
      ciudad: d.ciudad,
      provincia: d.provincia,
    });
  }
  const pedidosBC = Array.from(new Set((items || []).map((i) => i.numero_tecmelec).filter(Boolean))) as string[];
  return { success: true, direcciones: opciones, contactos: contactos || [], pedidosBC };
}

export async function actualizarEntregaSolicitud(
  pedidoId: string,
  datos: {
    nombre_contacto: string;
    telefono_contacto: string;
    direccion: { direccion: string; codigo_postal: string; ciudad: string; provincia: string; alias?: string } | null;
  }
) {
  const supabase = await comprobarCompras();
  if (!supabase) return { error: 'No autorizado.' };
  const nombre = (datos.nombre_contacto || '').trim();
  const telefono = (datos.telefono_contacto || '').trim();
  if (!nombre || !telefono) return { error: 'Indica el nombre y el teléfono de contacto.' };

  const { data: pedido } = await supabase.from('pedidos').select('id, usuario_id').eq('id', pedidoId).single();
  if (!pedido) return { error: 'No se encontró la solicitud.' };

  const admin = createAdminClient();
  const cambios: Record<string, any> = { nombre_contacto: nombre, telefono_contacto: telefono };

  if (datos.direccion) {
    const d = datos.direccion;
    if (!d.direccion.trim()) return { error: 'Indica la dirección de entrega.' };
    const { data: nueva, error } = await admin
      .from('direcciones')
      .insert({
        usuario_id: pedido.usuario_id,
        alias: (d.alias || 'Entrega').trim().slice(0, 60) || 'Entrega',
        direccion: d.direccion.trim(),
        codigo_postal: d.codigo_postal.trim() || null,
        ciudad: d.ciudad.trim() || null,
        provincia: d.provincia.trim() || null,
        oculta: true,
      })
      .select('id')
      .single();
    if (error || !nueva) return { error: 'No se pudo guardar la dirección: ' + (error?.message || '') };
    cambios.direccion_entrega_id = nueva.id;
  }

  const { error } = await admin.from('pedidos').update(cambios).eq('id', pedidoId);
  if (error) return { error: 'No se pudo guardar: ' + error.message };

  for (const ruta of ['/comprador', '/responsable', '/admin/pedidos', '/mis-pedidos', '/lineas-compras']) {
    revalidatePath(`${ruta}/${pedidoId}`);
  }
  return { success: true };
}
