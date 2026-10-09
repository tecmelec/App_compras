import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analizarLista, BUCKET_LISTAS_FOTO, type ModoLista } from '@/lib/lista-foto';

// Carrito desde foto, desde lista escrita o por referencias. Recibe una o varias
// fotos (ya reducidas en el navegador) y/o el texto de la lista, lo analiza con
// Claude y crea el registro en listas_foto. Las fotos se guardan en el bucket privado
// "listas-foto" (imagen_path = la primera; imagenes = todas); el texto, en "texto".
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_FOTOS = 4;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });

  const form = await request.formData();
  const admin = createAdminClient();
  const modo: ModoLista = form.get('modo') === 'referencias' ? 'referencias' : 'materiales';
  const texto = typeof form.get('texto') === 'string' ? String(form.get('texto')).trim() : '';
  if (texto.length > 8000) {
    return NextResponse.json({ error: 'La lista es demasiado larga (máximo 8000 caracteres).' }, { status: 400 });
  }

  const archivos = form.getAll('foto').filter((f) => f instanceof Blob && f.size > 0) as unknown as Blob[];
  if (archivos.length > MAX_FOTOS) {
    return NextResponse.json({ error: `Como máximo ${MAX_FOTOS} fotos por lista.` }, { status: 400 });
  }
  if (archivos.length === 0 && !texto) {
    return NextResponse.json(
      { error: modo === 'referencias' ? 'Escribe las referencias o adjunta alguna foto.' : 'No se ha recibido ninguna foto ni lista.' },
      { status: 400 }
    );
  }

  const imagenes: { data: string; mediaType: string; bytes: Buffer }[] = [];
  let total = 0;
  for (const archivo of archivos) {
    const mediaType = archivo.type && /^image\/(jpeg|png|webp)$/.test(archivo.type) ? archivo.type : 'image/jpeg';
    const bytes = Buffer.from(await archivo.arrayBuffer());
    total += bytes.length;
    imagenes.push({ data: bytes.toString('base64'), mediaType, bytes });
  }
  if (total > 4_000_000) {
    return NextResponse.json({ error: 'Las fotos ocupan demasiado. Prueba con menos fotos.' }, { status: 400 });
  }

  // Guardar las fotos
  const rutas: string[] = [];
  for (const im of imagenes) {
    const extension = im.mediaType === 'image/png' ? 'png' : im.mediaType === 'image/webp' ? 'webp' : 'jpg';
    const ruta = `${user.id}/${randomUUID()}.${extension}`;
    const { error } = await admin.storage
      .from(BUCKET_LISTAS_FOTO)
      .upload(ruta, im.bytes, { contentType: im.mediaType, upsert: false });
    if (error) {
      if (rutas.length) await admin.storage.from(BUCKET_LISTAS_FOTO).remove(rutas);
      return NextResponse.json(
        { error: `No se pudo guardar la foto (bucket "${BUCKET_LISTAS_FOTO}"): ${error.message}` },
        { status: 500 }
      );
    }
    rutas.push(ruta);
  }

  try {
    const lineas = await analizarLista({
      imagenes: imagenes.map(({ data, mediaType }) => ({ data, mediaType })),
      texto: texto || null,
      modo,
    });
    if (lineas.length === 0) {
      if (rutas.length) await admin.storage.from(BUCKET_LISTAS_FOTO).remove(rutas);
      return NextResponse.json({ id: null, lineas });
    }
    const { data: lista, error } = await admin
      .from('listas_foto')
      .insert({
        usuario_id: user.id,
        imagen_path: rutas[0] || null,
        imagenes: rutas.length ? rutas : null,
        texto: texto || null,
        modo,
        lineas,
      })
      .select('id')
      .single();
    if (error || !lista) throw new Error(`No se pudo guardar el análisis: ${error?.message || 'sin respuesta'}`);
    return NextResponse.json({ id: lista.id, lineas });
  } catch (e: any) {
    console.error('[carrito-lista]', e);
    if (rutas.length) await admin.storage.from(BUCKET_LISTAS_FOTO).remove(rutas);
    return NextResponse.json({ error: e.message || 'No se pudo analizar la lista.' }, { status: 500 });
  }
}
