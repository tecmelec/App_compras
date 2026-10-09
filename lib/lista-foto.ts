// Carrito desde foto: lee con Claude una lista de materiales escrita a mano,
// busca cada línea en el catálogo de la Tienda y propone producto + cantidad.
//
// 1. Claude (visión) transcribe la lista: texto, cantidad, unidad y palabras clave.
// 2. Para cada línea se buscan candidatos en el catálogo (puntuación por palabras).
// 3. Claude (texto) elige el candidato correcto o ninguno, y pasa la cantidad a la
//    unidad del producto. El redondeo al múltiplo de compra se hace aquí, no en Claude.
//
// Variables de entorno: ANTHROPIC_API_KEY (obligatoria) y ANTHROPIC_MODEL (opcional,
// por defecto el mismo modelo que la Edge Function leer-pedido-albaran).

import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerItemBC, buscarArticulosBC } from '@/lib/business-central';
import { ajustarAMultiplo, type CandidatoLista, type LineaLista } from '@/lib/lista-foto-tipos';

export type { CandidatoLista, LineaLista };

export const BUCKET_LISTAS_FOTO = 'listas-foto';
const MODELO = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';
const MAX_CANDIDATOS = 8;

// --- Claude -------------------------------------------------------------------------

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

const PROMPT_LECTURA = `Esta foto es una lista de materiales escrita (normalmente a mano) por un operario de una empresa de instalaciones eléctricas, para pedirlos a compras.

Transcribe cada material de la lista. Para cada línea devuelve:
- "texto": lo que pone, tal cual (corrige solo letras ilegibles evidentes).
- "cantidad": número (usa punto decimal) o null si no se indica.
- "unidad": la unidad escrita ("m", "ud", "rollo", "caja", "bobina"...) o null.
- "codigo": el código de artículo si aparece escrito tal cual (p. ej. "ZKT0009", "GCAB0689"; normalmente letras seguidas de números), en mayúsculas; si no, null.
- "busqueda": 3 a 8 palabras clave para buscarlo en un catálogo: el tipo de producto escrito completo (p. ej. "cable", "tubo", "caja", "tornillo"), designaciones técnicas normalizadas (RZ1-K, H07Z1-K, 3G1.5, 1x2.5, D20, M6...), medidas, marca y color si aparecen. Desarrolla abreviaturas habituales del gremio (p. ej. "corrug" → "corrugado", "mang" → "manguera").

Ignora títulos, fechas, nombres, firmas y líneas tachadas. Si una línea indica varias medidas o variantes, sepáralas en líneas distintas.

Responde SOLO con JSON, sin texto adicional:
{"lineas":[{"texto":"...","cantidad":100,"unidad":"m","codigo":null,"busqueda":["..."]}]}
Si no hay ninguna lista de materiales legible, responde {"lineas":[]}.`;

const PROMPT_LECTURA_REFERENCIAS = `Esto es un listado de materiales eléctricos con REFERENCIAS DE FABRICANTE (por ejemplo, un presupuesto o una oferta de un proveedor, en fotos y/o como texto). Si hay varias fotos, son páginas del mismo listado.

Para cada artículo devuelve:
- "texto": la referencia seguida de la descripción, tal cual aparecen (p. ej. "LVS03606 Tapa P NSX-CVS250 Hor.Man/Rot/Telem 4P").
- "referencia": la referencia del fabricante exactamente como está escrita, en mayúsculas y sin espacios (p. ej. "LVS03606", "A9F79432"); null si la línea no tiene referencia.
- "cantidad": número (usa punto decimal) o null.
- "unidad": la unidad si se indica ("ud", "m"...) o null.
- "busqueda": 3 a 8 palabras clave de la descripción (tipo de producto, medidas, polos, intensidad...).

Ignora cabeceras de capítulo, títulos, precios, importes, totales, descuentos, columnas de clasificación (p. ej. "ABC") y notas.

Responde SOLO con JSON, sin texto adicional:
{"lineas":[{"texto":"...","referencia":"LVS03606","cantidad":1,"unidad":null,"busqueda":["..."]}]}
Si no hay ningún artículo legible, responde {"lineas":[]}.`;

// --- Catálogo y búsqueda de candidatos ----------------------------------------------

type ProductoCatalogo = CandidatoLista & { texto: string; tokens: Set<string> };

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/(\d),(\d)/g, '$1.$2') // 1,5 → 1.5
    .replace(/(\d)\s*[x×*]\s*(\d)/g, '$1x$2'); // 3 x 1.5 → 3x1.5
}

function tokenizar(s: string): string[] {
  const base = normalizar(s).match(/[a-z0-9]+(?:[.x][a-z0-9]+)*/g) || [];
  const tokens = new Set<string>();
  for (const t of base) {
    tokens.add(t);
    // "1x1.5mm" → también "1x1.5"; "d20" → también "20"; "rz1-k" llega como "rz1" y "k"
    const sinUnidad = t.replace(/(mm2?|m)$/, '');
    if (sinUnidad && sinUnidad !== t) tokens.add(sinUnidad);
    const m = t.match(/^[a-z]+(\d+(?:\.\d+)?)$/);
    if (m) tokens.add(m[1]);
  }
  return Array.from(tokens).filter((t) => t.length > 1 || /\d/.test(t));
}

async function cargarCatalogo(): Promise<ProductoCatalogo[]> {
  const admin = createAdminClient();
  const productos: any[] = [];
  const pagina = 1000;
  for (let desde = 0; ; desde += pagina) {
    const { data, error } = await admin
      .from('productos')
      .select('id, nombre, descripcion, categoria, bc_item_no, unidad_medida, multiplo_compra, imagen_url')
      .eq('visible', true)
      .order('id')
      .range(desde, desde + pagina - 1);
    if (error) throw new Error('No se pudo leer el catálogo de la tienda.');
    productos.push(...(data || []));
    if (!data || data.length < pagina) break;
  }
  return productos.map((p) => {
    const texto = [p.nombre, p.descripcion, p.categoria, p.bc_item_no].filter(Boolean).join(' ');
    return {
      id: p.id,
      nombre: p.nombre,
      bc_item_no: p.bc_item_no,
      unidad_medida: p.unidad_medida,
      multiplo_compra: p.multiplo_compra || 1,
      imagen_url: p.imagen_url,
      texto,
      tokens: new Set(tokenizar(texto)),
    };
  });
}

function buscarCandidatos(catalogo: ProductoCatalogo[], consulta: string): ProductoCatalogo[] {
  const tokensConsulta = tokenizar(consulta);
  if (tokensConsulta.length === 0) return [];
  const puntuados: { p: ProductoCatalogo; puntos: number }[] = [];
  for (const p of catalogo) {
    let puntos = 0;
    for (const t of tokensConsulta) {
      // Las designaciones con números (3g1.5, 1x2.5, m6) pesan más que las palabras.
      const peso = /\d/.test(t) ? 3 : 1 + Math.min(t.length, 8) / 8;
      if (p.tokens.has(t)) {
        puntos += peso;
      } else if (t.length >= 4 && !/\d/.test(t)) {
        // coincidencia parcial de palabras: "corrug" ↔ "corrugado"
        for (const pt of Array.from(p.tokens)) {
          if (pt.startsWith(t) || t.startsWith(pt.length >= 4 ? pt : '\u0000')) {
            puntos += peso * 0.6;
            break;
          }
        }
      }
    }
    if (puntos > 0) puntuados.push({ p, puntos });
  }
  puntuados.sort((a, b) => b.puntos - a.puntos);
  return puntuados.slice(0, MAX_CANDIDATOS).map((x) => x.p);
}

// --- Códigos de artículo escritos en la lista -----------------------------------------

// Códigos con forma de Nº de artículo de BC: letras seguidas de números (ZKT0009,
// GCAB0689). Se toman del campo "codigo" que devuelve Claude y del propio texto.
function codigosEnLinea(l: { texto: string; codigo?: string | null }): string[] {
  const codigos = new Set<string>();
  const limpio = (c: string) => c.toUpperCase().replace(/[\s-]/g, '');
  // El código se busca tal cual está escrito (sin añadir ceros ni otras variantes).
  const anadir = (c: string) => codigos.add(limpio(c));
  if (typeof l.codigo === 'string' && l.codigo.trim()) anadir(l.codigo);
  // Sin \b delante: el código puede ir pegado a la cantidad ("300sch0998").
  for (const m of l.texto.toUpperCase().match(/(?<![A-Z])[A-Z]{2,6}[0-9]{2,7}[A-Z]?(?![A-Z0-9])/g) || []) anadir(m);
  return Array.from(codigos).filter((c) => /^[A-Z]{2,6}[0-9]{2,7}[A-Z]?$/.test(c));
}

// Producto oculto (no publicado en la tienda) para un código que existe en BC: se usa
// el de la tabla productos si ya existe; si no, se crea con visible = false.
async function productoOcultoPorCodigo(codigo: string): Promise<ProductoCatalogo | null> {
  const admin = createAdminClient();
  const columnas = 'id, nombre, descripcion, categoria, bc_item_no, unidad_medida, multiplo_compra, imagen_url, visible';
  let { data: p } = await admin.from('productos').select(columnas).eq('bc_item_no', codigo).maybeSingle();
  if (!p) {
    let item;
    try {
      item = await obtenerItemBC(codigo);
    } catch (e) {
      console.error(`[lista-foto] No se pudo consultar el código ${codigo} en BC`, e);
      return null;
    }
    if (!item) return null;
    const categoria = (item.Item_Category_Code || '').trim();
    const { data: nuevo, error } = await admin
      .from('productos')
      .insert({
        bc_item_no: item.No,
        nombre: item.Description,
        unidad_medida: item.Base_Unit_of_Measure,
        precio: item.Unit_Price || 0,
        multiplo_compra: item.Multiplo_de && item.Multiplo_de > 1 ? Math.round(item.Multiplo_de) : 1,
        producto_comun: (item.Common_Item_No || '').trim() || null,
        visible: false,
        ...(categoria ? { categoria } : {}),
      })
      .select(columnas)
      .single();
    if (error || !nuevo) {
      console.error(`[lista-foto] No se pudo dar de alta el código ${codigo}`, error);
      throw new Error(`El código ${codigo} existe en BC pero no se pudo dar de alta en la app: ${error?.message || 'sin respuesta'}`);
    }
    p = nuevo;
  }
  const texto = [p.nombre, p.descripcion, p.categoria, p.bc_item_no].filter(Boolean).join(' ');
  return {
    id: p.id,
    nombre: p.nombre,
    bc_item_no: p.bc_item_no,
    unidad_medida: p.unidad_medida,
    multiplo_compra: p.multiplo_compra || 1,
    imagen_url: p.imagen_url,
    texto,
    tokens: new Set(tokenizar(texto)),
  };
}

// --- Referencias de fabricante ---------------------------------------------------------

const normalizarRef = (r: string) => r.toUpperCase().replace(/\s+/g, '');

// ¿La descripción contiene la referencia como palabra completa? Devuelve 2 si va
// precedida de "REF." (la forma en que se codifican en BC), 1 si aparece suelta, 0 si no.
function puntuarReferencia(descripcion: string, ref: string): number {
  const d = descripcion.toUpperCase();
  const r = ref.toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`REF\\.?\\s*:?\\s*${r}(?![A-Z0-9])`).test(d)) return 2;
  if (new RegExp(`(?<![A-Z0-9])${r}(?![A-Z0-9])`).test(d)) return 1;
  return 0;
}

// Artículos cuya descripción incluye la referencia de fabricante: primero en el
// catálogo publicado; si no hay, en la ficha de productos de BC (que se dan de alta
// ocultos). Se prefieren los que llevan "REF. <referencia>".
async function articulosPorReferencia(
  ref: string,
  catalogo: ProductoCatalogo[]
): Promise<{ productos: ProductoCatalogo[]; exacta: boolean; ocultos: boolean } | null> {
  const enCatalogo = catalogo
    .map((p) => ({ p, puntos: puntuarReferencia(p.nombre, ref) }))
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos);
  if (enCatalogo.length > 0) {
    return { productos: enCatalogo.slice(0, 3).map((x) => x.p), exacta: enCatalogo[0].puntos === 2, ocultos: false };
  }
  let encontrados: { No: string; Description: string }[] = [];
  try {
    encontrados = await buscarArticulosBC(ref, 'descripcion', 15);
  } catch (e) {
    console.error(`[lista-foto] No se pudo buscar la referencia ${ref} en BC`, e);
    return null;
  }
  const ordenados = encontrados
    .map((a) => ({ a, puntos: puntuarReferencia(a.Description, ref) }))
    .filter((x) => x.puntos > 0)
    .sort((a, b) => b.puntos - a.puntos)
    .slice(0, 3);
  if (ordenados.length === 0) return null;
  const productos: ProductoCatalogo[] = [];
  for (const { a } of ordenados) {
    try {
      const p = await productoOcultoPorCodigo(a.No);
      if (p) productos.push(p);
    } catch (e) {
      console.error(`[lista-foto] No se pudo dar de alta ${a.No} (referencia ${ref})`, e);
    }
  }
  if (productos.length === 0) return null;
  return { productos, exacta: ordenados[0].puntos === 2, ocultos: true };
}

// Ejecuta tareas asíncronas con un máximo de "n" a la vez (para no saturar BC).
async function enParalelo<T, R>(elementos: T[], n: number, fn: (x: T, i: number) => Promise<R>): Promise<R[]> {
  const resultados: R[] = new Array(elementos.length);
  let siguiente = 0;
  async function trabajador() {
    while (siguiente < elementos.length) {
      const i = siguiente++;
      resultados[i] = await fn(elementos[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(n, elementos.length) }, trabajador));
  return resultados;
}

// --- Análisis completo --------------------------------------------------------------

// Entrada del análisis: fotos de la lista y/o la lista escrita como texto en la app.
// modo "materiales": lista de obra (descripciones); modo "referencias": listado con
// referencias de fabricante (p. ej. un presupuesto), que se buscan en las descripciones
// de los artículos de BC ("... REF. LVS03606").
export type ModoLista = 'materiales' | 'referencias';
export type EntradaLista = {
  imagenes?: { data: string; mediaType: string }[];
  texto?: string | null;
  modo?: ModoLista;
};

export async function analizarListaFoto(imagen: { data: string; mediaType: string }): Promise<LineaLista[]> {
  return analizarLista({ imagenes: [imagen] });
}

export async function analizarLista(entrada: EntradaLista): Promise<LineaLista[]> {
  const modo: ModoLista = entrada.modo || 'materiales';
  const imagenes = entrada.imagenes || [];
  const texto = (entrada.texto || '').trim();

  // 1. Lectura de la lista (fotos con visión y/o texto escrito en la app)
  let prompt = modo === 'referencias' ? PROMPT_LECTURA_REFERENCIAS : PROMPT_LECTURA;
  if (modo === 'materiales' && imagenes.length === 0) {
    prompt = prompt
      .replace('Esta foto es una lista de materiales escrita (normalmente a mano)', 'Este texto es una lista de materiales escrita')
      .replace('Si no hay ninguna lista de materiales legible', 'Si no hay ninguna lista de materiales');
  }
  const contenido: any[] = [
    ...imagenes.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.data } })),
    {
      type: 'text',
      text: prompt + (texto ? `\n\nLista escrita:\n"""\n${texto.slice(0, 8000)}\n"""` : ''),
    },
  ];
  const lectura = extraerJSON(await llamarClaude(contenido, 4000));
  const leidas: {
    texto: string;
    cantidad: number | null;
    unidad: string | null;
    codigo?: string | null;
    referencia?: string | null;
    busqueda: string[];
  }[] = (
    Array.isArray(lectura?.lineas) ? lectura.lineas : []
  )
    .filter((l: any) => typeof l?.texto === 'string' && l.texto.trim())
    .slice(0, 80);
  if (leidas.length === 0) return [];

  // 2. Candidatos del catálogo
  const catalogo = await cargarCatalogo();
  const candidatosPorLinea = leidas.map((l) =>
    buscarCandidatos(catalogo, `${l.texto} ${(l.busqueda || []).join(' ')}`)
  );

  // 2b. Códigos de artículo escritos en la lista (p. ej. "3 uds ZKT0009"). Si el código
  // es de un producto publicado, se propone ese; si no está en la tienda pero existe en
  // BC, se da de alta oculto (visible = false) y se propone igualmente. Estas líneas no
  // pasan por la elección de Claude.
  type ResultadoCodigo =
    | { producto: ProductoCatalogo; oculto: boolean; alternativas?: ProductoCatalogo[]; referencia?: string; exacta?: boolean }
    | { error: string }
    | null;
  const porCodigo: ResultadoCodigo[] = await enParalelo(
    leidas,
    4,
    async (l, i): Promise<ResultadoCodigo> => {
      // Modo referencias: la referencia de fabricante en la descripción de BC ("REF. X").
      if (modo === 'referencias' && typeof l.referencia === 'string' && l.referencia.trim()) {
        const ref = normalizarRef(l.referencia);
        if (ref.length >= 3) {
          const r = await articulosPorReferencia(ref, catalogo);
          if (r) {
            return {
              producto: r.productos[0],
              oculto: r.ocultos,
              alternativas: r.productos.slice(1),
              referencia: ref,
              exacta: r.exacta,
            };
          }
        }
      }
      const codigos = codigosEnLinea(l);
      for (const codigo of codigos) {
        const enCandidatos = candidatosPorLinea[i].find((c) => (c.bc_item_no || '').toUpperCase() === codigo);
        if (enCandidatos) return { producto: enCandidatos, oculto: false };
        const enCatalogo = catalogo.find((c) => (c.bc_item_no || '').toUpperCase() === codigo);
        if (enCatalogo) return { producto: enCatalogo, oculto: false };
        try {
          const oculto = await productoOcultoPorCodigo(codigo);
          if (oculto) return { producto: oculto, oculto: true };
        } catch (e: any) {
          return { error: String(e?.message || e) };
        }
      }
      return null;
    }
  );
  porCodigo.forEach((pc, i) => {
    if (pc && 'producto' in pc) {
      const propios = [pc.producto, ...(pc.alternativas || [])];
      const resto = candidatosPorLinea[i].filter((c) => !propios.some((p) => p.id === c.id));
      candidatosPorLinea[i] = [...propios, ...resto].slice(0, MAX_CANDIDATOS);
    }
  });

  // 3. Elección con Claude
  const bloques = leidas
    .map((l, i) => {
      const cands = candidatosPorLinea[i]
        .map(
          (c, k) =>
            `   ${i + 1}.${k + 1}: ${c.nombre}${c.bc_item_no ? ` [${c.bc_item_no}]` : ''} — unidad: ${c.unidad_medida || 'ud.'}${c.multiplo_compra > 1 ? `, se vende en múltiplos de ${c.multiplo_compra}` : ''}`
        )
        .join('\n');
      return `Línea ${i + 1}: "${l.texto}" — cantidad escrita: ${l.cantidad ?? 'no indicada'} ${l.unidad || ''}\n${cands || '   (sin candidatos en el catálogo)'}`;
    })
    .join('\n\n');

  const promptEleccion = `Eres el comprador de una empresa de instalaciones eléctricas. Un operario ha escrito una lista de materiales y, para cada línea, hay candidatos del catálogo de nuestra tienda.

${bloques}

Para cada línea elige el candidato que sea EL MISMO material (mismo tipo, sección, medida, polos, material, color si se indica). Si ninguno lo es, o la línea es demasiado ambigua, elige null: es preferible no proponer nada a proponer un material distinto. No elijas un candidato solo porque se parece.

Indica además la cantidad en la unidad del producto elegido: si la lista dice "2 rollos" y el producto se vende por metros, y el rollo estándar se deduce del nombre (p. ej. "rollo 100 m"), son 200; si no se puede convertir con seguridad, usa la cantidad escrita. NO redondees al múltiplo de venta (se hace después).

"confianza": "alta" si es claramente el mismo material, "media" si hay alguna duda menor (marca, color...), "baja" si es dudoso.
"nota": muy breve, en español, solo si aporta algo (p. ej. "no se indica la sección", "en la tienda solo hay de 100 m").

Responde SOLO con JSON:
{"resultados":[{"linea":1,"candidato":"1.2","cantidad":200,"confianza":"alta","nota":null}]}`;

  const eleccion = extraerJSON(await llamarClaude([{ type: 'text', text: promptEleccion }], 6000));
  const resultados = new Map<number, any>();
  for (const r of Array.isArray(eleccion?.resultados) ? eleccion.resultados : []) {
    const n = Number(r?.linea);
    if (Number.isInteger(n) && n > 0) resultados.set(n, r);
  }

  return leidas.map((l, i) => {
    const r = resultados.get(i + 1);
    const candidatos = candidatosPorLinea[i];
    let elegido: ProductoCatalogo | null = null;
    const resultadoCodigo = porCodigo[i];
    const pc = resultadoCodigo && 'producto' in resultadoCodigo ? resultadoCodigo : null;
    const errorCodigo = resultadoCodigo && 'error' in resultadoCodigo ? resultadoCodigo.error : null;
    if (pc) {
      elegido = pc.producto;
    } else if (r?.candidato != null && r.candidato !== '') {
      // "1.2" (texto o número) → candidato 2 de la línea 1
      const partes = String(r.candidato).split('.');
      const k = Number(partes[partes.length - 1]) - 1;
      elegido = Number.isInteger(k) && k >= 0 ? candidatos[k] || null : null;
    }
    const cantidadEscrita = typeof l.cantidad === 'number' && l.cantidad > 0 ? l.cantidad : null;
    const cantidadProducto = elegido
      ? !pc && typeof r?.cantidad === 'number' && r.cantidad > 0
        ? r.cantidad
        : cantidadEscrita
      : cantidadEscrita;
    return {
      n: i + 1,
      texto: l.texto.trim(),
      cantidad_escrita: cantidadEscrita,
      unidad_escrita: l.unidad || null,
      producto_propuesto_id: elegido?.id || null,
      cantidad_producto: cantidadProducto,
      cantidad_propuesta: elegido ? ajustarAMultiplo(cantidadProducto ?? elegido.multiplo_compra, elegido.multiplo_compra) : null,
      confianza: pc ? (pc.referencia && !pc.exacta ? 'media' : 'alta') : elegido ? (['alta', 'media', 'baja'].includes(r?.confianza) ? r.confianza : 'media') : null,
      nota: pc
        ? pc.referencia
          ? `Encontrado por la referencia ${pc.referencia}${pc.exacta ? '' : ' (sin "REF." delante en la descripción: compruébalo)'}${
              pc.alternativas && pc.alternativas.length > 0 ? `; hay ${pc.alternativas.length} artículo(s) más con esa referencia en el desplegable` : ''
            }${pc.oculto ? '. No está publicado en la tienda.' : '.'}`
          : pc.oculto
          ? `Encontrado por su código (${pc.producto.bc_item_no}) en Business Central; no está publicado en la tienda.`
          : `Encontrado por su código (${pc.producto.bc_item_no}).`
        : errorCodigo
          ? errorCodigo
          : typeof r?.nota === 'string' && r.nota.trim()
            ? r.nota.trim()
            : null,
      candidatos: candidatos.map(({ id, nombre, bc_item_no, unidad_medida, multiplo_compra, imagen_url }) => ({
        id,
        nombre,
        bc_item_no,
        unidad_medida,
        multiplo_compra,
        imagen_url,
      })),
    };
  });
}

// Líneas de las listas en foto de una solicitud que siguen sin resolver: sin artículo
// en la solicitud y sin rechazar. Mientras haya alguna, la solicitud no se puede aprobar.
export async function lineasListaFotoSinResolver(pedidoId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data: listas } = await admin.from('listas_foto').select('lineas').eq('pedido_id', pedidoId);
  if (!listas || listas.length === 0) return [];
  const { data: items } = await admin.from('pedido_items').select('producto_id').eq('pedido_id', pedidoId);
  const productos = new Set((items || []).map((i) => i.producto_id));
  const pendientes: string[] = [];
  for (const lista of listas) {
    for (const l of (lista.lineas || []) as LineaLista[]) {
      if (l.rechazada) continue;
      if (l.producto_id && productos.has(l.producto_id)) continue;
      pendientes.push(l.texto);
    }
  }
  return pendientes;
}
