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
  // 1. Lectura del presupuesto
  const contenido: any[] = [
    ...archivos.map((a) =>
      a.mediaType === 'application/pdf'
        ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.data } }
        : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.data } }
    ),
    { type: 'text', text: PROMPT_PRESUPUESTO },
  ];
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
