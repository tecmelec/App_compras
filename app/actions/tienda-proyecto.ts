'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buscarCatalogoBC } from '@/lib/catalogo-bc';
import { productoOcultoPorCodigo } from '@/lib/lista-foto';
import { redondearCantidad } from '@/lib/cantidad';
import {
  ROLES_TIENDA_PROYECTO,
  comprobarExcesosTienda,
  consumosProyecto,
  puedeAutorizarAmpliacion,
  registrarAmpliacion,
  type ConsumoArticulo,
  type ExcesoTienda,
  type FueraPresupuesto,
} from '@/lib/tienda-proyecto';

async function usuarioActual() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo, nombre_completo').eq('id', user.id).single();
  if (!perfil?.activo) return null;
  return { id: user.id, rol: perfil.rol as string, nombre: (perfil.nombre_completo as string) || '' };
}

async function gestor() {
  const yo = await usuarioActual();
  return yo && ROLES_TIENDA_PROYECTO.includes(yo.rol) ? yo : null;
}

function cantidadValida(n: number, { cero = false } = {}): boolean {
  if (!Number.isFinite(n)) return false;
  if (cero ? n < 0 : n <= 0) return false;
  return Math.abs(n - redondearCantidad(n)) < 1e-9;
}

export type ProyectoTienda = { id: string; bc_job_no: string; descripcion: string | null; num_articulos: number; favorito: boolean };

export async function proyectosTiendaProyecto(): Promise<{ proyectos?: ProyectoTienda[]; error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const [{ data: proyectos }, { data: arts }, { data: favs }] = await Promise.all([
    admin.from('proyectos').select('*').eq('estado', 'Open').order('bc_job_no'),
    admin.from('tienda_proyecto_articulos').select('proyecto_id'),
    // Si la migración de favoritos aún no está aplicada, simplemente no hay favoritos.
    admin.from('tienda_proyecto_favoritos').select('proyecto_id').eq('usuario_id', yo.id),
  ]);
  const favoritos = new Set((favs || []).map((f: any) => f.proyecto_id as string));
  const cuenta = new Map<string, number>();
  for (const a of arts || []) cuenta.set((a as any).proyecto_id, (cuenta.get((a as any).proyecto_id) || 0) + 1);
  // Proyectos con tienda aunque ya no estén abiertos, para no perderlos de vista.
  const ids = new Set((proyectos || []).map((p: any) => p.id));
  const faltan = Array.from(new Set([...Array.from(cuenta.keys()), ...Array.from(favoritos)])).filter((id) => !ids.has(id));
  const { data: extra } = faltan.length ? await admin.from('proyectos').select('*').in('id', faltan) : { data: [] as any[] };
  const lista = [...(proyectos || []), ...(extra || [])]
    .filter((p: any) => !p.tipo || p.tipo === 'Obra' || cuenta.has(p.id) || favoritos.has(p.id))
    .map((p: any) => ({
      id: p.id,
      bc_job_no: p.bc_job_no,
      descripcion: p.descripcion,
      num_articulos: cuenta.get(p.id) || 0,
      favorito: favoritos.has(p.id),
    }));
  return { proyectos: lista };
}

export async function marcarProyectoFavorito(proyectoId: string, favorito: boolean): Promise<{ error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  const admin = createAdminClient();
  const { error } = favorito
    ? await admin.from('tienda_proyecto_favoritos').upsert({ usuario_id: yo.id, proyecto_id: proyectoId })
    : await admin.from('tienda_proyecto_favoritos').delete().eq('usuario_id', yo.id).eq('proyecto_id', proyectoId);
  if (error) {
    if (/tienda_proyecto_favoritos/.test(error.message || '')) {
      return { error: 'Falta aplicar la migración 20261030130000_tienda_proyecto_favoritos.sql.' };
    }
    return { error: `No se pudo guardar el favorito: ${error.message}` };
  }
  return {};
}

export async function consumosTiendaProyecto(
  proyectoId: string
): Promise<{ articulos?: ConsumoArticulo[]; fuera?: FueraPresupuesto[]; error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  try {
    return await consumosProyecto(proyectoId);
  } catch (e: any) {
    return { error: e?.message || 'No se pudo leer la tienda del proyecto.' };
  }
}

export type ResultadoBusquedaTienda = {
  clave: string;
  producto_id: string | null;
  codigo_bc: string | null;
  nombre: string;
  unidad: string | null;
  multiplo: number;
  origen: 'tienda' | 'bc';
};

// Buscador para añadir artículos sueltos: tienda Tecmelec + catálogo completo de BC.
export async function buscarArticulosTiendaProyecto(texto: string): Promise<{ resultados?: ResultadoBusquedaTienda[]; error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  const t = (texto || '').trim().slice(0, 100);
  if (t.length < 2) return { resultados: [] };
  const admin = createAdminClient();
  let q = admin.from('productos').select('id, nombre, bc_item_no, unidad_medida, multiplo_compra').eq('visible', true).limit(15);
  for (const palabra of t.split(/\s+/).filter(Boolean).slice(0, 6)) {
    const p = palabra.replace(/[%,()]/g, '');
    if (p) q = q.or(`nombre.ilike.%${p}%,bc_item_no.ilike.%${p}%`);
  }
  const [{ data: tienda }, bc] = await Promise.all([q, buscarCatalogoBC(t, 0, 15).catch(() => [])]);
  const resultados: ResultadoBusquedaTienda[] = (tienda || []).map((p: any) => ({
    clave: `p:${p.id}`,
    producto_id: p.id,
    codigo_bc: p.bc_item_no,
    nombre: p.nombre,
    unidad: p.unidad_medida,
    multiplo: p.multiplo_compra || 1,
    origen: 'tienda',
  }));
  const ya = new Set(resultados.map((r) => (r.codigo_bc || '').toUpperCase()));
  for (const a of bc as any[]) {
    if (ya.has(String(a.no).toUpperCase())) continue;
    resultados.push({
      clave: `bc:${a.no}`,
      producto_id: null,
      codigo_bc: a.no,
      nombre: a.descripcion,
      unidad: a.unidad || null,
      multiplo: 1,
      origen: 'bc',
    });
  }
  return { resultados };
}

export type AltaArticuloTienda = {
  producto_id?: string | null;
  codigo_bc?: string | null;
  cantidad_maxima: number;
  cantidad_inicial?: number;
  comentario?: string | null;
};

export async function anadirArticulosTiendaProyecto(
  proyectoId: string,
  items: AltaArticuloTienda[]
): Promise<{ anadidos?: number; avisos?: string[]; error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  if (!proyectoId) return { error: 'Selecciona el proyecto.' };
  const lista = (items || []).slice(0, 200);
  if (lista.length === 0) return { error: 'No hay artículos que añadir.' };
  const admin = createAdminClient();
  const { data: existentes, error: eExist } = await admin
    .from('tienda_proyecto_articulos')
    .select('producto_id')
    .eq('proyecto_id', proyectoId);
  if (eExist) return { error: `No se pudo leer la tienda del proyecto: ${eExist.message}` };
  const yaEnTienda = new Set((existentes || []).map((e: any) => e.producto_id));
  const avisos: string[] = [];
  let anadidos = 0;
  const vistos = new Set<string>();

  for (const it of lista) {
    const maxima = Number(it.cantidad_maxima);
    const inicial = Number(it.cantidad_inicial ?? 0);
    let productoId = it.producto_id || null;
    let nombre = it.codigo_bc || 'Artículo';
    if (!productoId && it.codigo_bc) {
      try {
        const p = await productoOcultoPorCodigo(String(it.codigo_bc).trim().toUpperCase());
        productoId = p?.id || null;
        if (p) nombre = p.nombre;
      } catch (e: any) {
        avisos.push(`${it.codigo_bc}: ${e?.message || 'no se pudo dar de alta'}.`);
        continue;
      }
    } else if (productoId) {
      const { data: p } = await admin.from('productos').select('nombre').eq('id', productoId).maybeSingle();
      if (!p) {
        avisos.push('Un artículo ya no existe en el catálogo.');
        continue;
      }
      nombre = p.nombre;
    }
    if (!productoId) {
      avisos.push(`${nombre}: no se encontró el artículo.`);
      continue;
    }
    if (!cantidadValida(maxima)) {
      avisos.push(`${nombre}: la cantidad máxima debe ser mayor que 0 (máx. 3 decimales).`);
      continue;
    }
    if (!cantidadValida(inicial, { cero: true })) {
      avisos.push(`${nombre}: cantidad inicial no válida.`);
      continue;
    }
    if (yaEnTienda.has(productoId) || vistos.has(productoId)) {
      avisos.push(`${nombre}: ya está en la tienda del proyecto (modifícalo desde su ficha).`);
      continue;
    }
    vistos.add(productoId);
    const { data: nuevo, error } = await admin
      .from('tienda_proyecto_articulos')
      .insert({
        proyecto_id: proyectoId,
        producto_id: productoId,
        cantidad_maxima: redondearCantidad(maxima),
        cantidad_inicial: redondearCantidad(inicial),
        creado_por: yo.id,
      })
      .select('id')
      .single();
    if (error || !nuevo) {
      avisos.push(`${nombre}: ${error?.message || 'no se pudo añadir'}.`);
      continue;
    }
    anadidos++;
    await admin.from('tienda_proyecto_historial').insert({
      articulo_id: nuevo.id,
      tipo: 'alta',
      valor_nuevo: redondearCantidad(maxima),
      cantidad: redondearCantidad(inicial),
      comentario: (it.comentario || '').trim().slice(0, 1000) || null,
      usuario_id: yo.id,
      usuario_nombre: yo.nombre,
    });
  }
  return { anadidos, avisos };
}

export async function modificarArticuloTiendaProyecto(
  articuloId: string,
  datos: { cantidad_maxima: number; cantidad_inicial: number; comentario?: string | null }
): Promise<{ error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  const maxima = Number(datos.cantidad_maxima);
  const inicial = Number(datos.cantidad_inicial);
  if (!cantidadValida(maxima)) return { error: 'La cantidad máxima debe ser mayor que 0 (máx. 3 decimales).' };
  if (!cantidadValida(inicial, { cero: true })) return { error: 'La cantidad inicial no es válida.' };
  const admin = createAdminClient();
  const { data: art } = await admin
    .from('tienda_proyecto_articulos')
    .select('cantidad_maxima, cantidad_inicial')
    .eq('id', articuloId)
    .maybeSingle();
  if (!art) return { error: 'No se encontró el artículo.' };
  const antesMax = Number(art.cantidad_maxima);
  const antesIni = Number(art.cantidad_inicial);
  const cambiaMax = Math.abs(antesMax - maxima) > 1e-9;
  const cambiaIni = Math.abs(antesIni - inicial) > 1e-9;
  if (!cambiaMax && !cambiaIni) return {};
  const { error } = await admin
    .from('tienda_proyecto_articulos')
    .update({ cantidad_maxima: redondearCantidad(maxima), cantidad_inicial: redondearCantidad(inicial), updated_at: new Date().toISOString() })
    .eq('id', articuloId);
  if (error) return { error: `No se pudo guardar: ${error.message}` };
  const comentario = (datos.comentario || '').trim().slice(0, 1000) || null;
  const filas = [
    cambiaMax && { tipo: 'cantidad_maxima', valor_anterior: antesMax, valor_nuevo: redondearCantidad(maxima) },
    cambiaIni && { tipo: 'cantidad_inicial', valor_anterior: antesIni, valor_nuevo: redondearCantidad(inicial) },
  ]
    .filter(Boolean)
    .map((f: any) => ({ ...f, articulo_id: articuloId, comentario, usuario_id: yo.id, usuario_nombre: yo.nombre }));
  await admin.from('tienda_proyecto_historial').insert(filas);
  return {};
}

export async function ampliarArticuloTiendaProyecto(articuloId: string, cantidad: number, comentario?: string | null) {
  const yo = await usuarioActual();
  if (!yo) return { error: 'Debes iniciar sesión.' };
  const admin = createAdminClient();
  const { data: art } = await admin.from('tienda_proyecto_articulos').select('proyecto_id').eq('id', articuloId).maybeSingle();
  if (!art) return { error: 'No se encontró el artículo.' };
  const permitido = ROLES_TIENDA_PROYECTO.includes(yo.rol) || (await puedeAutorizarAmpliacion(yo.id, yo.rol, art.proyecto_id));
  if (!permitido) return { error: 'No puedes ampliar la tienda de este proyecto.' };
  const n = Number(cantidad);
  // Admite negativos (reducir lo autorizado), pero no 0 ni más de 3 decimales.
  if (!Number.isFinite(n) || n === 0 || !cantidadValida(Math.abs(n))) {
    return { error: 'Indica una ampliación distinta de 0 (puede ser negativa, máx. 3 decimales).' };
  }
  return registrarAmpliacion({ articuloId, cantidad: Number(cantidad), usuarioId: yo.id, usuarioNombre: yo.nombre, comentario });
}

export async function eliminarArticuloTiendaProyecto(articuloId: string): Promise<{ error?: string }> {
  const yo = await gestor();
  if (!yo) return { error: 'No autorizado.' };
  const { error } = await createAdminClient().from('tienda_proyecto_articulos').delete().eq('id', articuloId);
  return error ? { error: `No se pudo quitar: ${error.message}` } : {};
}

export type EntradaHistorialTienda = {
  id: string;
  tipo: 'alta' | 'cantidad_maxima' | 'cantidad_inicial' | 'ampliacion';
  valor_anterior: number | null;
  valor_nuevo: number | null;
  cantidad: number | null;
  numero_app: string | null;
  pedido_id: string | null;
  comentario: string | null;
  usuario_nombre: string | null;
  created_at: string;
};

// Historial de un artículo: admin y responsables con acceso al proyecto.
export async function historialArticuloTiendaProyecto(articuloId: string): Promise<{ historial?: EntradaHistorialTienda[]; error?: string }> {
  const yo = await usuarioActual();
  if (!yo) return { error: 'Debes iniciar sesión.' };
  const admin = createAdminClient();
  const { data: art } = await admin.from('tienda_proyecto_articulos').select('proyecto_id').eq('id', articuloId).maybeSingle();
  if (!art) return { error: 'No se encontró el artículo.' };
  const permitido = yo.rol === 'admin' || (await puedeAutorizarAmpliacion(yo.id, yo.rol, art.proyecto_id));
  if (!permitido) return { error: 'No autorizado.' };
  const { data, error } = await admin
    .from('tienda_proyecto_historial')
    .select('id, tipo, valor_anterior, valor_nuevo, cantidad, numero_app, pedido_id, comentario, usuario_nombre, created_at')
    .eq('articulo_id', articuloId)
    .order('created_at', { ascending: false });
  if (error) return { error: error.message };
  return {
    historial: (data || []).map((h: any) => ({
      ...h,
      valor_anterior: h.valor_anterior == null ? null : Number(h.valor_anterior),
      valor_nuevo: h.valor_nuevo == null ? null : Number(h.valor_nuevo),
      cantidad: h.cantidad == null ? null : Number(h.cantidad),
    })),
  };
}

// Carrito: al elegir el proyecto, ¿algún artículo supera lo autorizado en su tienda?
export async function comprobarTiendaProyectoCarrito(
  proyectoId: string,
  items: { producto_id: string; cantidad: number }[]
): Promise<{ excesos: ExcesoTienda[]; puedeAutorizar: boolean; error?: string }> {
  const yo = await usuarioActual();
  if (!yo) return { excesos: [], puedeAutorizar: false, error: 'Debes iniciar sesión.' };
  try {
    const excesos = await comprobarExcesosTienda(proyectoId, items);
    const puedeAutorizar = excesos.length > 0 ? await puedeAutorizarAmpliacion(yo.id, yo.rol, proyectoId) : false;
    return { excesos, puedeAutorizar };
  } catch (e: any) {
    return { excesos: [], puedeAutorizar: false, error: e?.message || 'No se pudo comprobar la tienda del proyecto.' };
  }
}
