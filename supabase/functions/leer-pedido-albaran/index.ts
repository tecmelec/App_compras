// Supabase Edge Function: leer-pedido-albaran
//
// Lee las fotos de albaranes (bucket "Fotos albaranes") cuyo registro en
// public.photo_ocr tiene pedido_compra = 'Sin asignar' (o vacío/NULL), obtiene
// el texto con Claude (API de Anthropic) y extrae el Nº de pedido de compra:
//   1. "PC" + 2 dígitos de año + 5 dígitos (ej. PC2609220), tolerando espacios,
//      guiones o puntos entre las partes.
//   2. Si no hay "PC" (p. ej. albaranes de Saltoki): un número suelto de 7
//      cifras que empiece por el año actual o el anterior (en 2026: 26 o 25);
//      se guarda con el prefijo "PC".
//   3. Si no encaja nada, pedido_compra queda en blanco ('').
//
// Llamadas:
//   POST { "file_name": "..." }  -> procesa solo esa foto (lo usa el trigger)
//   POST {}                      -> procesa las pendientes (barrido / cron)
//   POST { "rehacer_texto": [..] } -> relee esas fotos solo para mejorar el texto
//
// Además del pedido, guarda en extracted_text la transcripción completa hecha por
// Claude, que sustituye al OCR del móvil.
//
// Secretos necesarios (Supabase → Edge Functions → Secrets): ANTHROPIC_API_KEY.
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los pone Supabase automáticamente.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const BUCKET = 'Fotos albaranes';
const MODELO = 'claude-sonnet-5';
const MAX_POR_LLAMADA = 10;
const EXTENSIONES_IMAGEN = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

const PROMPT = `Esta imagen es un albarán de entrega (o un documento de compra) de un proveedor a la empresa Tecmelec.
Transcribe TODO el texto que puedas leer, tal cual aparece, línea por línea.
Presta especial atención a números de pedido y referencias del cliente (por ejemplo "Su pedido", "Pedido cliente", "Nº pedido", "Referencia", "Ref. cliente", "S/Ref."), copiando los dígitos con exactitud.
No interpretes, no resumas y no añadas comentarios: devuelve solo la transcripción.`;

// --- Reglas de extracción del Nº de pedido -------------------------------------

export function extraerPedido(texto: string, hoy = new Date()): string {
  const t = (texto || '').toUpperCase();

  // 1) Caso normal: PC + 2 dígitos de año + 5 dígitos, tolerando espacios/guiones/puntos.
  const normal = t.match(/P\s*[-.]?\s*C\s*[-.]?\s*(\d{2})\s*[-.]?\s*(\d{5})(?!\d)/);
  if (normal) return `PC${normal[1]}${normal[2]}`;

  // 2) Caso Saltoki: número suelto de 7 cifras que empieza por el año actual o el anterior.
  const yy = hoy.getFullYear() % 100;
  const anios = [yy, (yy + 99) % 100].map((n) => String(n).padStart(2, '0'));
  const saltoki = t.match(new RegExp(`(?<!\\d)(?:${anios.join('|')})\\d{5}(?!\\d)`));
  if (saltoki) return `PC${saltoki[0]}`;

  // 3) Nada que encaje: en blanco.
  return '';
}

// --- Utilidades ------------------------------------------------------------------

function json(cuerpo: unknown, status = 200) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

async function obtenerImagen(
  supabaseUrl: string,
  supabase: ReturnType<typeof createClient>,
  fileName: string
): Promise<{ data: string; mediaType: string } | null> {
  // Versión reducida (más rápida y barata), con la transformación de imágenes de Supabase.
  const ruta = `${encodeURIComponent(BUCKET)}/${fileName.split('/').map(encodeURIComponent).join('/')}`;
  try {
    const r = await fetch(`${supabaseUrl}/storage/v1/render/image/public/${ruta}?width=1800&resize=contain&quality=80`, {
      headers: { Accept: 'image/jpeg,image/png,image/webp' },
    });
    if (r.ok) {
      const tipo = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
      if (/^image\/(jpeg|png|webp|gif)$/.test(tipo)) {
        return { data: encodeBase64(new Uint8Array(await r.arrayBuffer())), mediaType: tipo };
      }
    }
  } catch (_) {
    // si falla la transformación, se intenta con el original
  }

  const { data, error } = await supabase.storage.from(BUCKET).download(fileName);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (bytes.length > 3_700_000) return null; // demasiado grande para enviarla sin reducir
  const tipo = data.type && /^image\/(jpeg|png|webp|gif)$/.test(data.type) ? data.type : 'image/jpeg';
  return { data: encodeBase64(bytes), mediaType: tipo };
}

async function transcribir(apiKey: string, imagen: { data: string; mediaType: string }): Promise<string> {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: MODELO,
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: imagen.mediaType, data: imagen.data } },
            { type: 'text', text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const cuerpo = await r.json();
  return (cuerpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
}

// --- Función ----------------------------------------------------------------------

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return json({ error: 'Falta el secreto ANTHROPIC_API_KEY en Supabase.' }, 500);

  let fileName: string | null = null;
  let rehacer: string[] = [];
  try {
    const cuerpo = await req.json();
    fileName = typeof cuerpo?.file_name === 'string' ? cuerpo.file_name : null;
    // { "rehacer_texto": ["foto1.jpeg", ...] } -> vuelve a leer esas fotos aunque ya
    // tengan pedido, solo para mejorar extracted_text (el pedido no se toca si ya lo tiene).
    if (Array.isArray(cuerpo?.rehacer_texto)) {
      rehacer = cuerpo.rehacer_texto.filter((x: unknown) => typeof x === 'string').slice(0, MAX_POR_LLAMADA);
    }
  } catch (_) {
    // sin cuerpo: barrido de pendientes
  }

  // Normalmente solo se procesan registros pendientes (Sin asignar / vacío), así
  // que llamar de más no repite trabajo ni coste.
  let consulta = supabase.from('photo_ocr').select('file_name, pedido_compra');
  if (rehacer.length) {
    consulta = consulta.in('file_name', rehacer);
  } else {
    consulta = consulta.or('pedido_compra.is.null,pedido_compra.eq."Sin asignar"');
    if (fileName) {
      consulta = consulta.eq('file_name', fileName);
    } else {
      const haceUnaSemana = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
      consulta = consulta.gte('created_at', haceUnaSemana).order('created_at').limit(MAX_POR_LLAMADA);
    }
  }
  const { data: pendientes, error } = await consulta;
  if (error) return json({ error: error.message }, 500);

  const resultados: { file_name: string; pedido_compra?: string; error?: string }[] = [];

  for (const fila of pendientes || []) {
    const nombre = fila.file_name as string;
    try {
      const pendiente = fila.pedido_compra == null || fila.pedido_compra === 'Sin asignar';
      if (!EXTENSIONES_IMAGEN.test(nombre)) {
        // No es una foto (p. ej. .emptyFolderPlaceholder): se deja en blanco.
        if (pendiente) await supabase.from('photo_ocr').update({ pedido_compra: '' }).eq('file_name', nombre);
        resultados.push({ file_name: nombre, pedido_compra: '' });
        continue;
      }
      const imagen = await obtenerImagen(supabaseUrl, supabase, nombre);
      if (!imagen) {
        // Puede que la foto aún se esté subiendo: se reintenta en el siguiente barrido.
        resultados.push({ file_name: nombre, error: 'Imagen no disponible todavía' });
        continue;
      }
      const texto = (await transcribir(apiKey, imagen)).trim().slice(0, 20000);
      const pedido = extraerPedido(texto);

      // El texto leído por Claude sustituye al OCR del móvil (mucho peor en fotos de cámara).
      if (texto) {
        const { error: errTxt } = await supabase.from('photo_ocr').update({ extracted_text: texto }).eq('file_name', nombre);
        if (errTxt) throw new Error(errTxt.message);
      }
      // El pedido solo se graba si seguía pendiente (no se pisa lo que ya tenga).
      if (pendiente) {
        const { error: errUpd } = await supabase
          .from('photo_ocr')
          .update({ pedido_compra: pedido })
          .eq('file_name', nombre)
          .or('pedido_compra.is.null,pedido_compra.eq."Sin asignar"');
        if (errUpd) throw new Error(errUpd.message);
      }
      console.log(`${nombre} -> ${pendiente ? pedido || '(en blanco)' : '(solo texto)'}`);
      resultados.push({ file_name: nombre, pedido_compra: pendiente ? pedido : fila.pedido_compra });
    } catch (e) {
      console.error(`${nombre}:`, e);
      resultados.push({ file_name: nombre, error: String((e as Error)?.message || e) });
    }
  }

  return json({ procesadas: resultados.length, resultados });
});
