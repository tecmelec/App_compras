import { claudeJSON } from '@/lib/ia-json';
import type { LineaLista } from '@/lib/lista-foto-tipos';

// Adjuntos del asistente (fotos o PDF): se analizan en /api/asistente/adjuntos (una
// petición aparte, por el límite de 60 s y de tamaño de Vercel) y el resultado viaja con
// el mensaje del usuario a preguntarAsistente. No se guardan las fotos.
//   - "lista": una lista de materiales (a mano, impresa o PDF) → líneas con candidatos
//     del catálogo, como "Crear carrito desde foto".
//   - "producto": la foto de un material concreto → qué es (descripción, marca,
//     referencia) para que el asistente lo busque en la tienda / BC.

export type CandidatoAdjunto = { id: string; nombre: string; ref: string | null; unidad: string | null; multiplo: number };

export type LineaAdjunto = {
  n: number;
  texto: string;
  cantidad: number | null;
  unidad: string | null;
  propuesto: string | null; // producto_id propuesto por el análisis
  confianza: 'alta' | 'media' | 'baja' | null;
  nota: string | null;
  candidatos: CandidatoAdjunto[];
};

export type ProductoIdentificado = {
  descripcion: string;
  marca: string | null;
  referencia: string | null;
  busqueda: string[];
};

export type AdjuntoAsistente = {
  archivos: number;
  tipo: 'lista' | 'producto' | 'nada';
  lineas?: LineaAdjunto[];
  productos?: ProductoIdentificado[];
};

const MAX_LINEAS = 60;
const MAX_CANDIDATOS = 4;

export function resumirLineas(lineas: LineaLista[]): LineaAdjunto[] {
  return lineas.slice(0, MAX_LINEAS).map((l) => ({
    n: l.n,
    texto: l.texto.slice(0, 200),
    cantidad: l.cantidad_propuesta ?? l.cantidad_producto ?? l.cantidad_escrita,
    unidad: l.unidad_escrita,
    propuesto: l.producto_propuesto_id,
    confianza: l.confianza,
    nota: l.nota ? l.nota.slice(0, 200) : null,
    candidatos: [
      // El propuesto primero
      ...l.candidatos.filter((c) => c.id === l.producto_propuesto_id),
      ...l.candidatos.filter((c) => c.id !== l.producto_propuesto_id),
    ]
      .slice(0, MAX_CANDIDATOS)
      .map((c) => ({ id: c.id, nombre: c.nombre.slice(0, 160), ref: c.bc_item_no, unidad: c.unidad_medida, multiplo: c.multiplo_compra || 1 })),
  }));
}

const PROMPT_PRODUCTO = `Esta foto la ha enviado un trabajador de una empresa de instalaciones eléctricas porque quiere pedir ese material. No es una lista: muestra el material (o su etiqueta, caja o placa de características).

Identifica cada material distinto que se vea (normalmente uno; como máximo 5) y devuelve SOLO este JSON:
{"productos":[{"descripcion":"…","marca":"…"|null,"referencia":"…"|null,"busqueda":["…","…"]}]}

- descripcion: qué es, en español y con los términos de un catálogo de material eléctrico (tipo, características legibles: sección, polos, intensidad, curva, tensión, potencia, IP, color, longitud…). Ej.: "Interruptor magnetotérmico 2P 16A curva C 6kA".
- marca: solo si se lee o se reconoce con seguridad.
- referencia: la referencia de fabricante tal como aparece (sin inventarla); null si no se lee.
- busqueda: 2 a 4 búsquedas cortas (2-4 palabras) para encontrarlo en el catálogo, de más concreta a más general. Ej.: ["magnetotermico 2P 16A","magnetotermico 16A","A9F74216"].
Si no se ve ningún material reconocible, devuelve {"productos":[]}.`;

export async function identificarProductosEnFotos(imagenes: { data: string; mediaType: string }[]): Promise<ProductoIdentificado[]> {
  const contenido: any[] = [
    ...imagenes.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })),
    { type: 'text', text: PROMPT_PRODUCTO },
  ];
  const r = await claudeJSON(contenido, 1200);
  return (Array.isArray(r?.productos) ? r.productos : [])
    .filter((p: any) => typeof p?.descripcion === 'string' && p.descripcion.trim())
    .slice(0, 5)
    .map((p: any) => ({
      descripcion: String(p.descripcion).slice(0, 200),
      marca: typeof p.marca === 'string' && p.marca.trim() ? p.marca.slice(0, 60) : null,
      referencia: typeof p.referencia === 'string' && p.referencia.trim() ? p.referencia.slice(0, 60) : null,
      busqueda: (Array.isArray(p.busqueda) ? p.busqueda : [])
        .filter((b: any) => typeof b === 'string' && b.trim())
        .slice(0, 4)
        .map((b: string) => b.slice(0, 60)),
    }));
}

// Limpia lo que llega del navegador (se reenvía en cada pregunta): tamaños acotados.
export function sanearAdjunto(a: any): AdjuntoAsistente | null {
  if (!a || typeof a !== 'object') return null;
  const tipo = a.tipo === 'lista' || a.tipo === 'producto' ? a.tipo : 'nada';
  const num = (v: any) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const txt = (v: any, n: number) => (typeof v === 'string' && v.trim() ? v.slice(0, n) : null);
  return {
    archivos: Math.min(10, Math.max(0, Number(a.archivos) || 0)),
    tipo,
    lineas:
      tipo === 'lista' && Array.isArray(a.lineas)
        ? a.lineas.slice(0, MAX_LINEAS).map((l: any, i: number) => ({
            n: num(l?.n) ?? i + 1,
            texto: txt(l?.texto, 200) || '',
            cantidad: num(l?.cantidad),
            unidad: txt(l?.unidad, 20),
            propuesto: txt(l?.propuesto, 40),
            confianza: ['alta', 'media', 'baja'].includes(l?.confianza) ? l.confianza : null,
            nota: txt(l?.nota, 200),
            candidatos: (Array.isArray(l?.candidatos) ? l.candidatos : []).slice(0, MAX_CANDIDATOS).map((c: any) => ({
              id: txt(c?.id, 40) || '',
              nombre: txt(c?.nombre, 160) || '',
              ref: txt(c?.ref, 40),
              unidad: txt(c?.unidad, 20),
              multiplo: num(c?.multiplo) || 1,
            })),
          }))
        : undefined,
    productos:
      tipo === 'producto' && Array.isArray(a.productos)
        ? a.productos.slice(0, 5).map((p: any) => ({
            descripcion: txt(p?.descripcion, 200) || '',
            marca: txt(p?.marca, 60),
            referencia: txt(p?.referencia, 60),
            busqueda: (Array.isArray(p?.busqueda) ? p.busqueda : []).slice(0, 4).map((b: any) => String(b).slice(0, 60)),
          }))
        : undefined,
  };
}

// Texto que se añade al mensaje del usuario para que el asistente sepa qué se adjuntó.
export function textoAdjunto(a: AdjuntoAsistente, propuestos: Set<string> | null): string {
  const cab = `[Adjunto: ${a.archivos} archivo(s), analizado por la app]`;
  if (a.tipo === 'nada') return `${cab}\nNo se ha reconocido ninguna lista ni ningún material en el adjunto.`;
  if (a.tipo === 'producto') {
    return `${cab}\nFoto de material (no es una lista). Identificado:\n${(a.productos || [])
      .map(
        (p, i) =>
          `${i + 1}. ${p.descripcion}${p.marca ? ` · marca ${p.marca}` : ''}${p.referencia ? ` · ref. ${p.referencia}` : ''} · búsquedas sugeridas: ${p.busqueda.join(' | ')}`
      )
      .join('\n')}`;
  }
  const lineas = a.lineas || [];
  const fmt = (l: LineaAdjunto) =>
    `L${l.n}. "${l.texto}"${l.cantidad != null ? ` · cantidad ${l.cantidad}${l.unidad ? ` ${l.unidad}` : ''}` : ''}${l.nota ? ` · nota: ${l.nota}` : ''}`;
  const candid = (l: LineaAdjunto) =>
    l.candidatos.length
      ? l.candidatos.map((c) => `      - ${c.nombre}${c.ref ? ` [${c.ref}]` : ''} (producto_id ${c.id}, ud ${c.unidad || 'ud'}, múltiplo ${c.multiplo})`).join('\n')
      : '      (sin candidatos en la tienda)';
  if (!propuestos) {
    // Adjunto de un mensaje anterior: solo como referencia para las preguntas que sigan.
    return `${cab} (de un mensaje anterior; su tarjeta de carrito ya se mostró)\nLista de materiales:\n${lineas
      .map((l) => `${fmt(l)}\n${candid(l)}`)
      .join('\n')}`;
  }
  const enTarjeta = lineas.filter((l) => l.propuesto && propuestos.has(l.propuesto));
  const pendientes = lineas.filter((l) => !enTarjeta.includes(l));
  return [
    `${cab}\nLista de materiales con ${lineas.length} línea(s).`,
    enTarjeta.length
      ? `Ya mostradas en la tarjeta de carrito (no las vuelvas a proponer):\n${enTarjeta
          .map((l) => `${fmt(l)} → ${l.candidatos.find((c) => c.id === l.propuesto)?.nombre || l.propuesto}`)
          .join('\n')}`
      : '',
    pendientes.length ? `Sin resolver (elige el usuario):\n${pendientes.map((l) => `${fmt(l)}\n${candid(l)}`).join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}
