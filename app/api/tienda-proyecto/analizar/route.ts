import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { analizarLista, type ModoLista } from '@/lib/lista-foto';
import { lineasDePDF, pareceLineaArticulo } from '@/lib/presupuesto';
import { ROLES_TIENDA_PROYECTO } from '@/lib/tienda-proyecto';

// Tienda por proyecto: alta masiva de artículos desde una lista escrita, por referencias
// o desde un presupuesto (PDF o fotos). Usa el mismo análisis que "Crear carrito desde
// lista/REF./foto", pero no guarda nada: solo devuelve las líneas con sus candidatos.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_FOTOS = 4;
const MAX_TEXTO = 8000;

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  if (!perfil?.activo || !ROLES_TIENDA_PROYECTO.includes(perfil.rol)) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 });
  }

  const form = await request.formData();
  const modoForm = String(form.get('modo') || 'lista');
  // Presupuesto y referencias: se buscan las referencias de fabricante en las descripciones de BC.
  const modo: ModoLista = modoForm === 'lista' ? 'materiales' : 'referencias';
  let texto = typeof form.get('texto') === 'string' ? String(form.get('texto')).trim() : '';

  const archivos = form.getAll('archivo').filter((f) => f instanceof Blob && f.size > 0) as unknown as Blob[];
  const imagenes: { data: string; mediaType: string }[] = [];
  let total = 0;
  for (const archivo of archivos) {
    const bytes = Buffer.from(await archivo.arrayBuffer());
    total += bytes.length;
    if (archivo.type === 'application/pdf') {
      const lineas = await lineasDePDF(bytes.toString('base64'));
      if (!lineas) {
        return NextResponse.json(
          { error: 'El PDF no tiene texto (parece escaneado). Adjunta fotos o capturas del presupuesto.' },
          { status: 400 }
        );
      }
      const articulos = lineas.filter(pareceLineaArticulo);
      const usadas = articulos.length >= 3 ? articulos : lineas;
      texto = [texto, usadas.join('\n')].filter(Boolean).join('\n');
    } else {
      const mediaType = /^image\/(jpeg|png|webp)$/.test(archivo.type) ? archivo.type : 'image/jpeg';
      imagenes.push({ data: bytes.toString('base64'), mediaType });
    }
  }
  if (imagenes.length > MAX_FOTOS) {
    return NextResponse.json({ error: `Como máximo ${MAX_FOTOS} fotos.` }, { status: 400 });
  }
  if (total > 4_000_000) {
    return NextResponse.json({ error: 'Los archivos ocupan demasiado. Prueba con menos fotos o un PDF más pequeño.' }, { status: 400 });
  }
  if (imagenes.length === 0 && !texto) {
    return NextResponse.json({ error: 'Escribe la lista o adjunta el presupuesto.' }, { status: 400 });
  }
  const recortado = texto.length > MAX_TEXTO;
  if (recortado) texto = texto.slice(0, MAX_TEXTO);

  try {
    const lineas = await analizarLista({ imagenes, texto: texto || null, modo });
    return NextResponse.json({
      lineas,
      aviso: recortado ? 'El documento es muy largo: solo se han analizado las primeras líneas. Añade el resto en otra tanda.' : null,
    });
  } catch (e: any) {
    console.error('[tienda-proyecto/analizar]', e);
    return NextResponse.json({ error: e.message || 'No se pudo analizar la lista.' }, { status: 500 });
  }
}
