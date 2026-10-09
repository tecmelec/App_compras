import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BUCKET_LISTAS_FOTO } from '@/lib/lista-foto';
import { analizarPresupuesto } from '@/lib/presupuesto';

// Asignar precios desde presupuesto: recibe el presupuesto (PDF o hasta 4 fotos) de
// una solicitud, lo guarda en el bucket privado, lo analiza y devuelve la propuesta
// de precios por línea. No cambia la solicitud: eso lo hace aplicarPreciosPresupuesto.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('rol').eq('id', user.id).single();
  if (!perfil || !['comprador', 'admin'].includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const form = await request.formData();
  const pedidoId = String(form.get('pedidoId') || '');
  const { data: pedido } = await supabase.from('pedidos').select('id').eq('id', pedidoId).single();
  if (!pedido) return NextResponse.json({ error: 'No se encontró la solicitud.' }, { status: 404 });

  const archivos = form.getAll('archivo').filter((f) => f instanceof Blob && f.size > 0) as unknown as File[];
  if (archivos.length === 0) return NextResponse.json({ error: 'Adjunta el presupuesto.' }, { status: 400 });
  if (archivos.length > 4) return NextResponse.json({ error: 'Como máximo 4 archivos.' }, { status: 400 });

  const leidos: { data: string; mediaType: string; bytes: Buffer; nombre: string }[] = [];
  let total = 0;
  for (const a of archivos) {
    const mediaType =
      a.type === 'application/pdf' ? 'application/pdf' : /^image\/(jpeg|png|webp)$/.test(a.type) ? a.type : 'image/jpeg';
    const bytes = Buffer.from(await a.arrayBuffer());
    total += bytes.length;
    leidos.push({ data: bytes.toString('base64'), mediaType, bytes, nombre: (a as any).name || 'presupuesto' });
  }
  if (total > 4_000_000) {
    return NextResponse.json({ error: 'El presupuesto ocupa demasiado (máximo 4 MB en total).' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: items } = await admin
    .from('pedido_items')
    .select('id, cantidad, numero_tecmelec, rechazada_por_aprobador, eliminada_en_bc, productos(nombre, bc_item_no)')
    .eq('pedido_id', pedidoId);
  // Solo las líneas que aún se pueden cambiar: sin pedido de compra y no rechazadas.
  const itemsLibres = (items || [])
    .filter((i: any) => !i.numero_tecmelec && !i.rechazada_por_aprobador && !i.eliminada_en_bc)
    .map((i: any) => ({
      id: i.id,
      nombre: i.productos?.nombre || 'Producto',
      bc_item_no: i.productos?.bc_item_no || null,
      cantidad: i.cantidad,
    }));

  const rutas: string[] = [];
  for (const l of leidos) {
    const ext = l.mediaType === 'application/pdf' ? 'pdf' : l.mediaType === 'image/png' ? 'png' : l.mediaType === 'image/webp' ? 'webp' : 'jpg';
    const ruta = `presupuestos/${pedidoId}/${randomUUID()}.${ext}`;
    const { error } = await admin.storage.from(BUCKET_LISTAS_FOTO).upload(ruta, l.bytes, { contentType: l.mediaType });
    if (error) {
      if (rutas.length) await admin.storage.from(BUCKET_LISTAS_FOTO).remove(rutas);
      return NextResponse.json({ error: `No se pudo guardar el presupuesto: ${error.message}` }, { status: 500 });
    }
    rutas.push(ruta);
  }

  try {
    const analisis = await analizarPresupuesto(
      leidos.map(({ data, mediaType }) => ({ data, mediaType })),
      itemsLibres
    );
    if (analisis.lineas.length === 0) throw new Error('No se ha encontrado ningún artículo en el presupuesto.');
    const { data: presupuesto, error } = await admin
      .from('presupuestos')
      .insert({
        pedido_id: pedidoId,
        archivos: rutas,
        nombres_archivo: leidos.map((l) => l.nombre),
        proveedor: analisis.proveedor,
        lineas: analisis.lineas,
        creado_por: user.id,
      })
      .select('id')
      .single();
    if (error || !presupuesto) throw new Error(`No se pudo guardar el presupuesto: ${error?.message || ''}`);
    return NextResponse.json({ id: presupuesto.id, ...analisis, items: itemsLibres });
  } catch (e: any) {
    console.error('[presupuesto]', e);
    if (rutas.length) await admin.storage.from(BUCKET_LISTAS_FOTO).remove(rutas);
    return NextResponse.json({ error: e.message || 'No se pudo analizar el presupuesto.' }, { status: 500 });
  }
}
