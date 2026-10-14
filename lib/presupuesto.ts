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

// Número en formato español ("5.860,34 €", "3,00") o inglés ("5860.34"); null si no lo es
// (p. ej. "#########" cuando la celda del Excel original era demasiado estrecha).
function numero(texto: string | undefined): number | null {
  if (!texto) return null;
  let t = texto.replace(/[€\s]/g, '');
  if (!/^-?[\d.,]+$/.test(t)) return null;
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
  else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

async function leerPresupuestoDeTexto(
  lineasPdf: string[]
): Promise<{ lineas: Omit<LineaPresupuesto, 'idx'>[]; proveedor: { nombre: string | null; cif: string | null } }> {
  const articulos = lineasPdf.filter(pareceLineaArticulo);
  const cabecera = lineasPdf.slice(0, 25);
  const pie = lineasPdf.filter((l) => /N\.?I\.?F|C\.?I\.?F/i.test(l)).slice(0, 3);
  const cabeceraColumnas = lineasPdf.find((l) => /descrip/i.test(l) && l.split(' | ').length >= 3) || '';
  const muestra = articulos.slice(0, 12);

  const prompt = `Este es el texto de un presupuesto u oferta de un proveedor de material eléctrico. Cada línea de artículo tiene sus columnas separadas por " | " (la columna 0 es la primera).

CABECERA DEL DOCUMENTO:
${[...cabecera, ...pie].join('\n')}

FILA DE TÍTULOS DE COLUMNA (si existe):
${cabeceraColumnas || '(no hay)'}

LÍNEAS DE ARTÍCULO DE MUESTRA:
${muestra.join('\n')}

Indica:
- "proveedor": el proveedor que EMITE el presupuesto (no el cliente, que es Tecmelec): {"nombre": "...", "cif": "..."}; null en cada campo si no aparece.
- "columnas": el índice de cada columna en las líneas de artículo:
  - "referencia": referencia o código del artículo,
  - "descripcion",
  - "cantidad",
  - "precio_unitario": precio NETO por unidad con TODOS los descuentos aplicados (si hay una columna de precio unitario ya descontado, esa; si solo hay precio unitario sin descuento, esa),
  - "precio_total": importe total NETO de la línea con descuentos (o null),
  - "descuento_pct": si los precios unitarios de la línea NO llevan aplicado un descuento general que el documento indica (p. ej. "Dto 3%" sin columna unitaria descontada), ese porcentaje; si no, 0.
Usa null si una columna no existe.

Responde SOLO con JSON:
{"proveedor":{"nombre":null,"cif":null},"columnas":{"referencia":0,"descripcion":1,"cantidad":2,"precio_unitario":5,"precio_total":6,"descuento_pct":0}}`;

  const r = extraerJSON(await llamarClaude([{ type: 'text', text: prompt }], 800));
  const c = r?.columnas || {};
  const idx = (k: string) => (Number.isInteger(c[k]) && c[k] >= 0 ? (c[k] as number) : null);
  const iRef = idx('referencia');
  const iDesc = idx('descripcion');
  const iCant = idx('cantidad');
  const iPrecio = idx('precio_unitario');
  const iTotal = idx('precio_total');
  const dto = Number(c.descuento_pct) > 0 && Number(c.descuento_pct) < 100 ? Number(c.descuento_pct) : 0;

  const lineas: Omit<LineaPresupuesto, 'idx'>[] = [];
  for (const l of articulos) {
    const col = l.split(' | ').map((x) => x.trim());
    const cantidad = iCant !== null ? numero(col[iCant]) : null;
    let precio = iPrecio !== null ? numero(col[iPrecio]) : null;
    if (precio === null && iTotal !== null && cantidad) {
      const total = numero(col[iTotal]);
      if (total !== null) precio = total / cantidad;
    }
    if (precio !== null && dto) precio = precio * (1 - dto / 100);
    const referencia = iRef !== null && col[iRef] ? col[iRef].toUpperCase().replace(/\s+/g, '') : null;
    const descripcion = iDesc !== null ? col[iDesc] || '' : col.slice(1, 2).join(' ');
    if (!referencia && !descripcion) continue;
    lineas.push({
      referencia,
      descripcion,
      cantidad,
      precio_unitario: precio !== null ? Number(precio.toFixed(5)) : null,
    });
  }
  return {
    lineas,
    proveedor: {
      nombre: typeof r?.proveedor?.nombre === 'string' ? r.proveedor.nombre : null,
      cif: typeof r?.proveedor?.cif === 'string' ? r.proveedor.cif : null,
    },
  };
}

export async function analizarPresupuesto(
  archivos: ArchivoPresupuesto[],
  items: ItemSolicitud[]
): Promise<{ proveedor: ProveedorPresupuesto; lineas: LineaPresupuesto[]; propuestas: PropuestaPrecio[] }> {
  // 1. Lectura del presupuesto.
  //    - PDF con texto: las líneas se leen aquí. A Claude solo se le pide que diga qué
  //      columna es cada dato (referencia, descripción, cantidad, precio neto por unidad)
  //      a partir de la cabecera y unas líneas de muestra, y el proveedor. Así la
  //      respuesta es corta aunque el presupuesto tenga cientos de líneas (antes Claude
  //      las transcribía todas y se superaban los 60 s del servidor).
  //    - Fotos y PDF escaneados: Claude los lee y transcribe (como hasta ahora).
  const lineasLeidas: Omit<LineaPresupuesto, 'idx'>[] = [];
  let proveedorLeido: { nombre: string | null; cif: string | null } = { nombre: null, cif: null };
  const visuales: any[] = [];
  for (const a of archivos) {
    if (a.mediaType === 'application/pdf') {
      const lineasPdf = await lineasDePDF(a.data);
      if (lineasPdf) {
        const r = await leerPresupuestoDeTexto(lineasPdf);
        lineasLeidas.push(...r.lineas);
        if (!proveedorLeido.nombre && !proveedorLeido.cif) proveedorLeido = r.proveedor;
        continue;
      }
      visuales.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } });
    } else {
      visuales.push({ type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } });
    }
  }
  if (visuales.length > 0) {
    const lectura = extraerJSON(await llamarClaude([...visuales, { type: 'text', text: PROMPT_PRESUPUESTO }], 8000));
    for (const l of (Array.isArray(lectura?.lineas) ? lectura.lineas : []).slice(0, 200)) {
      if (!l || !(l.descripcion || l.referencia)) continue;
      lineasLeidas.push({
        referencia: typeof l.referencia === 'string' && l.referencia.trim() ? l.referencia.trim().toUpperCase().replace(/\s+/g, '') : null,
        descripcion: String(l.descripcion || '').trim(),
        cantidad: l.cantidad !== null && Number.isFinite(Number(l.cantidad)) ? Number(l.cantidad) : null,
        precio_unitario:
          l.precio_unitario !== null && Number.isFinite(Number(l.precio_unitario)) ? Number(Number(l.precio_unitario).toFixed(5)) : null,
      });
    }
    if (!proveedorLeido.nombre && !proveedorLeido.cif) {
      proveedorLeido = {
        nombre: typeof lectura?.proveedor?.nombre === 'string' ? lectura.proveedor.nombre : null,
        cif: typeof lectura?.proveedor?.cif === 'string' ? lectura.proveedor.cif : null,
      };
    }
  }
  // Una vez cada artículo (referencia + descripción + precio), aunque se repita en varios capítulos.
  const vistas = new Set<string>();
  const lineas: LineaPresupuesto[] = [];
  for (const l of lineasLeidas) {
    const clave = `${compactar(l.referencia)}|${l.descripcion.toUpperCase()}|${l.precio_unitario}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    lineas.push({ idx: lineas.length + 1, ...l });
  }

  // 2. Proveedor
  const proveedor = await identificarProveedor(proveedorLeido.nombre, proveedorLeido.cif);

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
  // Para la elección con Claude, solo las líneas del presupuesto que comparten alguna
  // palabra con los artículos pendientes (máx. 150), para que la consulta sea rápida.
  const palabrasPendientes = new Set(items.filter((i) => !propuestas.has(i.id)).flatMap((i) => palabras(i.nombre)));
  const libres = lineas
    .filter((l) => !usadas.has(l.idx))
    .map((l) => ({ l, puntos: palabras(`${l.referencia || ''} ${l.descripcion}`).filter((w) => palabrasPendientes.has(w)).length }))
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 150)
    .map((x) => x.l);
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
