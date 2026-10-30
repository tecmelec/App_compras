import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { analizarLista } from '@/lib/lista-foto';
import { lineasDePDF } from '@/lib/presupuesto';
import { identificarProductosEnFotos, resumirLineas, type AdjuntoAsistente } from '@/lib/asistente/adjuntos';

// Asistente: analiza las fotos o el PDF adjuntos a una pregunta (no guarda nada).
// Primero como lista de materiales (como "Crear carrito desde foto"); si no hay lista,
// como foto de un material concreto, para que el asistente lo busque.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_FOTOS = 4;
const MAX_BYTES = 4_000_000;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('activo').eq('id', user.id).single();
  if (!perfil?.activo) return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  const { data: config } = await createAdminClient().from('configuracion').select('*').eq('id', 1).maybeSingle();
  if ((config as any)?.asistente_activo === false) {
    return NextResponse.json({ error: 'El asistente está desactivado.' }, { status: 403 });
  }

  const form = await request.formData();
  const archivos = form.getAll('archivo').filter((f) => f instanceof Blob && f.size > 0) as unknown as Blob[];
  if (archivos.length === 0) return NextResponse.json({ error: 'No hay archivos.' }, { status: 400 });
  if (archivos.reduce((s, a) => s + a.size, 0) > MAX_BYTES) {
    return NextResponse.json({ error: 'Los archivos ocupan demasiado (máx. 4 MB en total).' }, { status: 400 });
  }

  const imagenes: { data: string; mediaType: string }[] = [];
  let texto = '';
  for (const a of archivos) {
    const bytes = Buffer.from(await a.arrayBuffer());
    if (a.type === 'application/pdf') {
      const lineas = await lineasDePDF(bytes.toString('base64'));
      if (!lineas) {
        return NextResponse.json(
          { error: 'El PDF no tiene texto (parece escaneado). Adjunta una foto o captura en su lugar.' },
          { status: 400 }
        );
      }
      texto = [texto, lineas.join('\n')].filter(Boolean).join('\n');
    } else if (/^image\//.test(a.type)) {
      imagenes.push({ data: bytes.toString('base64'), mediaType: /^image\/(jpeg|png|webp|gif)$/.test(a.type) ? a.type : 'image/jpeg' });
    } else {
      return NextResponse.json({ error: 'Solo se pueden adjuntar fotos o PDF.' }, { status: 400 });
    }
  }
  if (imagenes.length > MAX_FOTOS) return NextResponse.json({ error: `Como máximo ${MAX_FOTOS} fotos.` }, { status: 400 });

  try {
    const lineas = await analizarLista({ imagenes, texto: texto ? texto.slice(0, 8000) : null, modo: 'materiales' });
    let adjunto: AdjuntoAsistente;
    if (lineas.length > 0) {
      adjunto = { archivos: archivos.length, tipo: 'lista', lineas: resumirLineas(lineas) };
    } else if (imagenes.length > 0) {
      const productos = await identificarProductosEnFotos(imagenes);
      adjunto = productos.length > 0 ? { archivos: archivos.length, tipo: 'producto', productos } : { archivos: archivos.length, tipo: 'nada' };
    } else {
      adjunto = { archivos: archivos.length, tipo: 'nada' };
    }
    return NextResponse.json({ adjunto });
  } catch (e: any) {
    console.error('[asistente/adjuntos]', e);
    return NextResponse.json({ error: 'No se ha podido leer el adjunto. Inténtalo de nuevo.' }, { status: 500 });
  }
}
