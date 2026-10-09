// Asignar precios desde un presupuesto de proveedor (PDF o fotos):
// 1. Claude lee el presupuesto: proveedor (nombre, CIF) y líneas (referencia,
//    descripción, cantidad, precio unitario neto).
// 2. El proveedor se busca en BC por CIF y, si no, por nombre.
// 3. Cada línea de la solicitud se empareja con una del presupuesto: primero por
//    referencia (la descripción del artículo lleva "REF. X") o código BC; el resto,
//    con Claude.

import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerProveedoresBC } from '@/lib/business-central';

const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export type LineaPresupuesto = {
  idx: number;
  referencia: string | null;
  descripcion: string;
  cantidad: number | null;
  precio_unitario: number | null; // neto, con descuentos
};

export type ProveedorPresupuesto = {
  nombre: string | null;
  cif: string | null;
  bc_no: string | null;
  bc_nombre: string | null;
  proveedor_id: string | null; // ficha en la tabla proveedores
  por: 'cif' | 'nombre' | null;
};

export type ItemSolicitud = { id: string; nombre: string; bc_item_no: string | null; cantidad: number };

export type PropuestaPrecio = { item_id: string; linea_idx: number | null; por: 'referencia' | 'codigo' | 'ia' | null };

export type ArchivoPresupuesto = { data: string; mediaType: string };

// --- PDF con texto ---------------------------------------------------------------------
// Los presupuestos en PDF suelen tener capa de texto (p. ej. los de SAP, de decenas de
// páginas y cientos de líneas). Leerlos como documento con Claude tarda demasiado, así
// que se extraen las líneas aquí (columnas separadas por " | ") y a Claude solo se le
// pasan la cabecera y las líneas de artículo relevantes para esta solicitud.

async function lineasDePDF(base64: string): Promise<string[] | null> {
  try {
    const { getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, 'base64')));
    const lineas: string[] = [];
    for (let p = 1; p <= pdf.numPages; p++) {
      const page = await pdf.getPage(p);
      const contenido = await page.getTextContent();
      const filas: { y: number; items: { x: number; s: string }[] }[] = [];
      for (const it of contenido.items as any[]) {
        if (!it || typeof it.str !== 'string' || !it.str.trim()) continue;
        const y = Math.round(it.transform[5]);
        let fila = filas.find((f) => Math.abs(f.y - y) <= 2);
        if (!fila) {
          fila = { y, items: [] };
          filas.push(fila);
        }
        fila.items.push({ x: it.transform[4], s: it.str.trim() });
      }
      filas
        .sort((a, b) => b.y - a.y)
        .forEach((f) => lineas.push(f.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(' | ')));
    }
    // Sin capa de texto (escaneado): se lee como documento con Claude.
    return lineas.join('').replace(/[\s|]/g, '').length > 200 ? lineas : null;
  } catch (e) {
    console.error('[presupuesto] No se pudo extraer el texto del PDF', e);
    return null;
  }
}

const pareceLineaArticulo = (l: string) => l.split(' | ').length >= 3 && /\d+[.,]\d{2}(?!\d)/.test(l);

const palabras = (s: string) =>
  (s || '')
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 2);

// Cabecera (para el proveedor) + líneas de artículo, filtradas por relevancia si hay muchas.
function textoRelevante(lineas: string[], items: ItemSolicitud[]): string {
  const cabecera = lineas.slice(0, 40);
  const pie = lineas.filter((l) => /N\.?I\.?F|C\.?I\.?F/i.test(l)).slice(0, 3);
  // Una sola vez cada artículo (referencia + descripción), aunque se repita en varios capítulos.
  const vistos = new Set<string>();
  const articulos: string[] = [];
  for (const l of lineas) {
    if (!pareceLineaArticulo(l)) continue;
    const c = l.split(' | ');
    const clave = `${c[0]}|${c[1] || ''}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    articulos.push(l);
  }
  let elegidas = articulos;
  if (articulos.length > 120) {
    const refs = items.flatMap((i) => [...referenciasDeNombre(i.nombre), i.bc_item_no || '']).map(compactar).filter((r) => r.length >= 3);
    const porReferencia = articulos.filter((l) => refs.some((r) => compactar(l).includes(r)));
    const porPalabras = articulos
      .filter((l) => !porReferencia.includes(l))
      .map((l) => {
        const pl = new Set(palabras(l));
        const puntos = Math.max(0, ...items.map((i) => palabras(i.nombre).filter((w) => pl.has(w)).length));
        return { l, puntos };
      })
      .filter((x) => x.puntos >= 2)
      .sort((a, b) => b.puntos - a.puntos)
      .map((x) => x.l);
    elegidas = [...porReferencia, ...porPalabras].slice(0, 120);
  }
  return `CABECERA DEL PRESUPUESTO:\n${[...cabecera, ...pie].join('\n')}\n\nLÍNEAS DE ARTÍCULOS (columnas separadas por " | "):\n${elegidas.join('\n')}`;
}

async function llamarClaude(content: any[], maxTokens: number): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('Falta la variable de entorno ANTHROPIC_API_KEY en Vercel.');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODELO, max_tokens: maxTokens, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) throw new Error(`Error de la API de Claude (${r.status}): ${(await r.text()).slice(0, 300)}`);
  const cuerpo = await r.json();
  return (cuerpo.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
}

function extraerJSON(texto: string): any {
  const limpio = texto.replace(/```json|```/g, '').trim();
  const inicio = limpio.indexOf('{');
  const fin = limpio.lastIndexOf('}');
  if (inicio < 0 || fin < inicio) throw new Error('La respuesta del análisis no tiene un formato válido.');
  return JSON.parse(limpio.slice(inicio, fin + 1));
}

const PROMPT_PRESUPUESTO = `Esto es un presupuesto u oferta de un proveedor de material eléctrico (puede tener varias páginas o fotos).

Devuelve:
- "proveedor": el proveedor que EMITE el presupuesto (no el cliente, que es Tecmelec): {"nombre": "...", "cif": "..."} (CIF/NIF tal cual, o null).
- "lineas": cada artículo con
  - "referencia": referencia o código del artículo tal cual (en mayúsculas, sin espacios) o null,
  - "descripcion": descripción,
  - "cantidad": número o null,
  - "precio_unitario": precio NETO por unidad, con descuentos aplicados (si solo hay importe total de la línea, divídelo entre la cantidad; si hay precio de tarifa y descuento, aplica el descuento). Número con punto decimal, sin IVA. null si no se puede saber.

Ignora cabeceras de capítulo, portes, totales, impuestos y notas.

Responde SOLO con JSON:
{"proveedor":{"nombre":"...","cif":"..."},"lineas":[{"referencia":"LVS03606","descripcion":"...","cantidad":1,"precio_unitario":15.95}]}`;

const normalizarCIF = (c: string | null | undefined) =>
  (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^ES(?=[A-Z0-9]{9}$)/, '');

const tokens = (s: string) =>
  new Set(
    (s || '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['S.L', 'SL', 'SLU', 'S.A', 'SA', 'SAU', 'CB'].includes(t))
  );

async function identificarProveedor(nombre: string | null, cif: string | null): Promise<ProveedorPresupuesto> {
  const resultado: ProveedorPresupuesto = { nombre, cif, bc_no: null, bc_nombre: null, proveedor_id: null, por: null };
  let proveedoresBC: { No: string; Name: string; VAT_Registration_No?: string }[] = [];
  try {
    proveedoresBC = await obtenerProveedoresBC();
  } catch (e) {
    console.error('[presupuesto] No se pudieron leer los proveedores de BC', e);
    return resultado;
  }
  let elegido: { No: string; Name: string } | null = null;
  const cifN = normalizarCIF(cif);
  if (cifN.length >= 8) {
    elegido = proveedoresBC.find((p) => normalizarCIF(p.VAT_Registration_No) === cifN) || null;
    if (elegido) resultado.por = 'cif';
  }
  if (!elegido && nombre) {
    const t = tokens(nombre);
    let mejor: { p: { No: string; Name: string }; puntos: number } | null = null;
    for (const p of proveedoresBC) {
      const tp = tokens(p.Name);
      if (tp.size === 0 || t.size === 0) continue;
      const comunes = Array.from(t).filter((x) => tp.has(x)).length;
      const puntos = comunes / Math.max(t.size, tp.size);
      if (!mejor || puntos > mejor.puntos) mejor = { p, puntos };
    }
    if (mejor && mejor.puntos >= 0.6) {
      elegido = mejor.p;
      resultado.por = 'nombre';
    }
  }
  if (!elegido) return resultado;
  resultado.bc_no = elegido.No;
  resultado.bc_nombre = elegido.Name;

  // Ficha en la app; si existe en BC pero aún no está sincronizado, se crea.
  const admin = createAdminClient();
  const { data: existente } = await admin.from('proveedores').select('id').eq('bc_proveedor_no', elegido.No).maybeSingle();
  if (existente) {
    resultado.proveedor_id = existente.id;
  } else {
    const { data: nuevo } = await admin
      .from('proveedores')
      .insert({ bc_proveedor_no: elegido.No, nombre: elegido.Name })
      .select('id')
      .single();
    resultado.proveedor_id = nuevo?.id || null;
  }
  return resultado;
}

// Referencias de fabricante que lleva la descripción de un artículo ("... REF. LVS03606").
function referenciasDeNombre(nombre: string): string[] {
  const refs: string[] = [];
  for (const m of nombre.toUpperCase().matchAll(/REF\.?\s*:?\s*([A-Z0-9][A-Z0-9.\-/]*[A-Z0-9])/g)) refs.push(m[1].replace(/\s+/g, ''));
  return refs;
}

const compactar = (s: string | null | undefined) => (s || '').toUpperCase().replace(/[\s.\-/]/g, '');

export async function analizarPresupuesto(
  archivos: ArchivoPresupuesto[],
  items: ItemSolicitud[]
): Promise<{ proveedor: ProveedorPresupuesto; lineas: LineaPresupuesto[]; propuestas: PropuestaPrecio[] }> {
  // 1. Lectura del presupuesto: los PDF con texto se pasan como texto (rápido); las
  //    fotos y los PDF escaneados, como imagen/documento.
  const contenido: any[] = [];
  const textos: string[] = [];
  for (const a of archivos) {
    if (a.mediaType === 'application/pdf') {
      const lineasPdf = await lineasDePDF(a.data);
      if (lineasPdf) {
        textos.push(textoRelevante(lineasPdf, items));
        continue;
      }
      contenido.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
    } else {
      contenido.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } });
    }
  }
  contenido.push({
    type: 'text',
    text:
      PROMPT_PRESUPUESTO +
      (textos.length ? `\n\nTexto extraído del presupuesto:\n"""\n${textos.join('\n\n').slice(0, 60000)}\n"""` : ''),
  });
  const lectura = extraerJSON(await llamarClaude(contenido, 8000));
  const lineas: LineaPresupuesto[] = (Array.isArray(lectura?.lineas) ? lectura.lineas : [])
    .filter((l: any) => l && (l.descripcion || l.referencia))
    .slice(0, 200)
    .map((l: any, i: number) => ({
      idx: i + 1,
      referencia: typeof l.referencia === 'string' && l.referencia.trim() ? l.referencia.trim().toUpperCase().replace(/\s+/g, '') : null,
      descripcion: String(l.descripcion || '').trim(),
      cantidad: Number.isFinite(Number(l.cantidad)) && l.cantidad !== null ? Number(l.cantidad) : null,
      precio_unitario:
        l.precio_unitario !== null && Number.isFinite(Number(l.precio_unitario)) ? Number(Number(l.precio_unitario).toFixed(5)) : null,
    }));

  // 2. Proveedor
  const proveedor = await identificarProveedor(
    typeof lectura?.proveedor?.nombre === 'string' ? lectura.proveedor.nombre : null,
    typeof lectura?.proveedor?.cif === 'string' ? lectura.proveedor.cif : null
  );

  // 3. Emparejar líneas de la solicitud con el presupuesto
  const propuestas = new Map<string, PropuestaPrecio>();
  const usadas = new Set<number>();
  for (const item of items) {
    const refs = referenciasDeNombre(item.nombre).map(compactar);
    let l = lineas.find((x) => !usadas.has(x.idx) && x.referencia && refs.includes(compactar(x.referencia)));
    let por: PropuestaPrecio['por'] = l ? 'referencia' : null;
    if (!l && item.bc_item_no) {
      l = lineas.find((x) => !usadas.has(x.idx) && x.referencia && compactar(x.referencia) === compactar(item.bc_item_no));
      if (l) por = 'codigo';
    }
    if (l) {
      usadas.add(l.idx);
      propuestas.set(item.id, { item_id: item.id, linea_idx: l.idx, por });
    }
  }

  const pendientes = items.filter((i) => !propuestas.has(i.id));
  const libres = lineas.filter((l) => !usadas.has(l.idx));
  if (pendientes.length > 0 && libres.length > 0) {
    const prompt = `Empareja artículos de una solicitud de compra con las líneas de un presupuesto de proveedor. Solo empareja si es claramente el MISMO artículo (mismo tipo, medidas, polos, intensidad, referencia...). Si no hay ninguno igual, null.

Artículos de la solicitud:
${pendientes.map((i, k) => `A${k + 1}: ${i.nombre}${i.bc_item_no ? ` [${i.bc_item_no}]` : ''} — cantidad ${i.cantidad}`).join('\n')}

Líneas del presupuesto:
${libres.map((l) => `P${l.idx}: ${l.referencia ? `${l.referencia} — ` : ''}${l.descripcion}${l.cantidad != null ? ` — cantidad ${l.cantidad}` : ''}`).join('\n')}

Cada línea del presupuesto se puede usar una sola vez. Responde SOLO con JSON:
{"emparejados":[{"articulo":"A1","linea":"P3"}]}`;
    try {
      const r = extraerJSON(await llamarClaude([{ type: 'text', text: prompt }], 4000));
      for (const e of Array.isArray(r?.emparejados) ? r.emparejados : []) {
        const k = Number(String(e?.articulo || '').replace(/\D/g, '')) - 1;
        const idx = Number(String(e?.linea || '').replace(/\D/g, ''));
        const item = pendientes[k];
        if (!item || !idx || usadas.has(idx) || !lineas.some((l) => l.idx === idx)) continue;
        usadas.add(idx);
        propuestas.set(item.id, { item_id: item.id, linea_idx: idx, por: 'ia' });
      }
    } catch (e) {
      console.error('[presupuesto] Error emparejando con Claude', e);
    }
  }

  return {
    proveedor,
    lineas,
    propuestas: items.map((i) => propuestas.get(i.id) || { item_id: i.id, linea_idx: null, por: null }),
  };
}
