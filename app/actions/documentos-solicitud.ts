'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { revalidatePath } from 'next/cache';
import { BUCKET_DOCUMENTOS, EXTENSIONES_DOCUMENTO, MAX_DOCUMENTO_BYTES, extensionDe } from '@/lib/documentos-solicitud';
import { accesoComprasPedido } from '@/lib/acceso-compras';

// Documentos que acompañan a una solicitud. Se adjuntan en el carrito (todos los
// perfiles excepto "usuario"): el navegador sube el archivo directamente a Storage con
// una URL firmada (sin pasar por Vercel, así no hay límite de 4,5 MB) y después se
// registra. Quedan sin solicitud (pedido_id null) hasta que se envía.

async function usuarioQuePuedeAdjuntar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || !perfil.rol || perfil.rol === 'usuario') return null;
  return user;
}

function nombreSeguro(nombre: string): string {
  const limpio = nombre
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/_+/g, '_');
  return limpio.slice(-80) || 'documento';
}

export async function prepararSubidaDocumento(nombre: string, tamano: number) {
  const user = await usuarioQuePuedeAdjuntar();
  if (!user) return { error: 'No tienes permiso para adjuntar documentos.' };
  if (!EXTENSIONES_DOCUMENTO.includes(extensionDe(nombre))) {
    return { error: `"${nombre}": tipo de archivo no admitido.` };
  }
  if (!tamano || tamano > MAX_DOCUMENTO_BYTES) {
    return { error: `"${nombre}" supera el máximo de 25 MB.` };
  }
  const ruta = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${nombreSeguro(nombre)}`;
  const { data, error } = await createAdminClient().storage.from(BUCKET_DOCUMENTOS).createSignedUploadUrl(ruta);
  if (error || !data) {
    return { error: `No se pudo preparar la subida (bucket "${BUCKET_DOCUMENTOS}"): ${error?.message || ''}` };
  }
  return { ruta, token: data.token };
}

export async function registrarDocumento(datos: { ruta: string; nombre: string; tipo: string; tamano: number }) {
  const user = await usuarioQuePuedeAdjuntar();
  if (!user) return { error: 'No tienes permiso para adjuntar documentos.' };
  if (!datos.ruta.startsWith(`${user.id}/`)) return { error: 'Ruta no válida.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('solicitud_documentos')
    .insert({
      usuario_id: user.id,
      ruta: datos.ruta,
      nombre: datos.nombre.slice(0, 200),
      tipo: datos.tipo || null,
      tamano: datos.tamano || null,
    })
    .select('id')
    .single();
  if (error || !data) {
    await admin.storage.from(BUCKET_DOCUMENTOS).remove([datos.ruta]);
    return { error: 'No se pudo registrar el documento: ' + (error?.message || '') };
  }
  return { id: data.id as string };
}

// Quita un documento del carrito (solo si aún no se ha enviado en una solicitud).
export async function descartarDocumento(id: string) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('solicitud_documentos')
    .select('id, ruta')
    .eq('id', id)
    .eq('usuario_id', user.id)
    .is('pedido_id', null)
    .maybeSingle();
  if (!doc) return;
  await admin.storage.from(BUCKET_DOCUMENTOS).remove([doc.ruta]);
  await admin.from('solicitud_documentos').delete().eq('id', doc.id);
}

// Documentos del carrito que siguen existiendo y sin enviar (con enlace para verlos).
export async function documentosCarrito(ids: string[]) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || ids.length === 0) return { documentos: [] as DocumentoCarrito[] };
  const admin = createAdminClient();
  const { data } = await admin
    .from('solicitud_documentos')
    .select('id, ruta, nombre, tamano')
    .in('id', ids)
    .eq('usuario_id', user.id)
    .is('pedido_id', null);
  const documentos = await Promise.all(
    (data || []).map(async (d) => ({
      id: d.id as string,
      nombre: d.nombre as string,
      tamano: d.tamano as number | null,
      url: (await admin.storage.from(BUCKET_DOCUMENTOS).createSignedUrl(d.ruta, 60 * 60)).data?.signedUrl || null,
    }))
  );
  return { documentos };
}

export type DocumentoCarrito = { id: string; nombre: string; tamano: number | null; url: string | null };

// Desde el detalle de la solicitud: el comprador o el admin adjuntan documentos
// (ofertas de varios proveedores, comparativos...) directamente a la solicitud.
async function compradorOAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || !['comprador', 'admin', 'integral'].includes(perfil.rol)) return null;
  return user;
}

export async function registrarDocumentoEnSolicitud(
  pedidoId: string,
  datos: { ruta: string; nombre: string; tipo: string; tamano: number }
) {
  const user = await compradorOAdmin();
  if (!user) return { error: 'Solo el comprador o el admin pueden adjuntar documentos aquí.' };
  if (!(await accesoComprasPedido(pedidoId))) return { error: 'No autorizado.' };
  if (!datos.ruta.startsWith(`${user.id}/`)) return { error: 'Ruta no válida.' };
  const admin = createAdminClient();
  const { data: pedido } = await admin.from('pedidos').select('id').eq('id', pedidoId).maybeSingle();
  if (!pedido) return { error: 'Solicitud no encontrada.' };
  const { error } = await admin.from('solicitud_documentos').insert({
    usuario_id: user.id,
    pedido_id: pedidoId,
    ruta: datos.ruta,
    nombre: datos.nombre.slice(0, 200),
    tipo: datos.tipo || null,
    tamano: datos.tamano || null,
  });
  if (error) {
    await admin.storage.from(BUCKET_DOCUMENTOS).remove([datos.ruta]);
    return { error: 'No se pudo registrar el documento: ' + error.message };
  }
  revalidatePath(`/comprador/${pedidoId}`);
  revalidatePath(`/admin/pedidos/${pedidoId}`);
  return { success: true };
}

// El comprador o el admin pueden quitar de una solicitud los documentos que adjuntaron ellos.
export async function eliminarDocumentoSolicitud(id: string) {
  const user = await compradorOAdmin();
  if (!user) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const { data: doc } = await admin
    .from('solicitud_documentos')
    .select('id, ruta, pedido_id')
    .eq('id', id)
    .eq('usuario_id', user.id)
    .maybeSingle();
  if (!doc) return { error: 'Solo puedes quitar los documentos que has adjuntado tú.' };
  await admin.storage.from(BUCKET_DOCUMENTOS).remove([doc.ruta]);
  await admin.from('solicitud_documentos').delete().eq('id', doc.id);
  if (doc.pedido_id) {
    revalidatePath(`/comprador/${doc.pedido_id}`);
    revalidatePath(`/admin/pedidos/${doc.pedido_id}`);
  }
  return { success: true };
}
