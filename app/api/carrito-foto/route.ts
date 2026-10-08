import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analizarListaFoto, BUCKET_LISTAS_FOTO } from '@/lib/lista-foto';

// Carrito desde foto: recibe la foto (ya reducida en el navegador), la guarda en el
// bucket privado "listas-foto", la analiza con Claude y crea el registro en listas_foto.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const form = await request.formData();
  const archivo = form.get('foto');
  if (!(archivo instanceof Blob) || archivo.size === 0) {
    return NextResponse.json({ error: 'No se ha recibido ninguna foto.' }, { status: 400 });
  }
  const mediaType = archivo.type && /^image\/(jpeg|png|webp)$/.test(archivo.type) ? archivo.type : 'image/jpeg';
  const bytes = Buffer.from(await archivo.arrayBuffer());
  if (bytes.length > 4_000_000) {
    return NextResponse.json({ error: 'La foto es demasiado grande.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const extension = mediaType === 'image/png' ? 'png' : mediaType === 'image/webp' ? 'webp' : 'jpg';
  const ruta = `${user.id}/${randomUUID()}.${extension}`;
  const { error: errorSubida } = await admin.storage
    .from(BUCKET_LISTAS_FOTO)
    .upload(ruta, bytes, { contentType: mediaType, upsert: false });
  if (errorSubida) {
    return NextResponse.json(
      { error: `No se pudo guardar la foto (bucket "${BUCKET_LISTAS_FOTO}"): ${errorSubida.message}` },
      { status: 500 }
    );
  }

  try {
    const lineas = await analizarListaFoto({ data: bytes.toString('base64'), mediaType });
    const { data: lista, error } = await admin
      .from('listas_foto')
      .insert({ usuario_id: user.id, imagen_path: ruta, lineas })
      .select('id')
      .single();
    if (error || !lista) throw new Error(`No se pudo guardar el análisis: ${error?.message || 'sin respuesta'}`);
    return NextResponse.json({ id: lista.id, lineas });
  } catch (e: any) {
    console.error('[carrito-foto]', e);
    await admin.storage.from(BUCKET_LISTAS_FOTO).remove([ruta]);
    return NextResponse.json({ error: e.message || 'No se pudo analizar la foto.' }, { status: 500 });
  }
}
