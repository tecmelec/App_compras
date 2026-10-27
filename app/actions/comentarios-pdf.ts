'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Comentarios del PDF del pedido de compra (encabezado y por línea). Solo comprador y
// admin. Ver migración 20261022130000_comentarios_pdf.sql.

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

export type LineaComentarioPdf = {
  id: string;
  bcItemNo: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  comentario: string;
  enPdf: boolean; // las de cantidad 0 o anuladas no salen en el PDF
};

export async function obtenerComentariosPdf(numeroTecmelec: string) {
  if (!(await compradorOAdmin())) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const [{ data: cab, error: errorCab }, { data: items, error: errorItems }, { data: anulado }] = await Promise.all([
    admin.from('pedido_tecmelec_comentarios').select('comentario').eq('numero_tecmelec', numeroTecmelec).maybeSingle(),
    admin
      .from('pedido_items')
      .select('id, cantidad, estado_id, estado_recepcion, comentario_pdf, productos(nombre, bc_item_no, unidad_medida)')
      .eq('numero_tecmelec', numeroTecmelec)
      .order('id'),
    admin.from('estados_pedido').select('id').ilike('nombre', 'anulado').maybeSingle(),
  ]);
  const errorConsulta = errorCab || errorItems;
  if (errorConsulta) {
    const falta = /pedido_tecmelec_comentarios|comentario_pdf/.test(errorConsulta.message || '');
    return {
      error: falta
        ? 'Falta aplicar la migración de comentarios del PDF (20261022130000) en la base de datos.'
        : 'No se pudieron cargar los comentarios: ' + errorConsulta.message,
    };
  }
  const lineas: LineaComentarioPdf[] = (items || []).map((it: any) => ({
    id: it.id,
    bcItemNo: it.productos?.bc_item_no || '',
    nombre: it.productos?.nombre || 'Producto',
    cantidad: Number(it.cantidad),
    unidad: it.productos?.unidad_medida || '',
    comentario: it.comentario_pdf || '',
    enPdf: Number(it.cantidad) > 0 && it.estado_recepcion !== 'Anulado' && (anulado?.id == null || it.estado_id !== anulado.id),
  }));
  return { encabezado: cab?.comentario || '', lineas };
}

export async function guardarComentariosPdf(
  numeroTecmelec: string,
  encabezado: string,
  lineas: { id: string; comentario: string }[]
) {
  const user = await compradorOAdmin();
  if (!user) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const textoCab = encabezado.trim().slice(0, 1500);
  const { error: errorCab } = textoCab
    ? await admin
        .from('pedido_tecmelec_comentarios')
        .upsert(
          { numero_tecmelec: numeroTecmelec, comentario: textoCab, actualizado_por: user.id, updated_at: new Date().toISOString() },
          { onConflict: 'numero_tecmelec' }
        )
    : await admin.from('pedido_tecmelec_comentarios').delete().eq('numero_tecmelec', numeroTecmelec);
  if (errorCab) return { error: 'No se pudo guardar el comentario de encabezado: ' + errorCab.message };

  for (const l of lineas) {
    const { error } = await admin
      .from('pedido_items')
      .update({ comentario_pdf: l.comentario.trim().slice(0, 500) || null })
      .eq('id', l.id)
      .eq('numero_tecmelec', numeroTecmelec);
    if (error) return { error: 'No se pudo guardar el comentario de una línea: ' + error.message };
  }
  return { success: true };
}
