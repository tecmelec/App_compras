'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { buscarCatalogoBC } from '@/lib/catalogo-bc';
import { productoOcultoPorCodigo } from '@/lib/lista-foto';

// "Crear desde artículos de BC": catálogo completo de BC para añadir al carrito.
// Disponible para admin, comprador y responsable (no para el perfil usuario).
const ROLES = ['admin', 'comprador', 'responsable'];

async function autorizado() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: perfil } = await supabase.from('profiles').select('rol, activo').eq('id', user.id).single();
  return !!perfil?.activo && ROLES.includes(perfil.rol);
}

export async function buscarArticulosCatalogo(busqueda: string, desde = 0) {
  if (!(await autorizado())) return { error: 'No autorizado.' };
  try {
    const articulos = await buscarCatalogoBC(busqueda, desde, 100);
    // Marca los que ya están publicados en la tienda
    const nos = articulos.map((a) => a.no);
    const { data: enTienda } = nos.length
      ? await createAdminClient().from('productos').select('bc_item_no').in('bc_item_no', nos).eq('visible', true)
      : { data: [] as { bc_item_no: string }[] };
    const publicados = new Set((enTienda || []).map((p) => p.bc_item_no));
    return {
      success: true,
      articulos: articulos.map((a) => ({ ...a, enTienda: publicados.has(a.no) })),
      hayMas: articulos.length === 100,
    };
  } catch (e: any) {
    return { error: e.message || 'No se pudo leer el catálogo de BC.' };
  }
}

// Producto de la app para un artículo de BC (el publicado si existe; si no, se da de
// alta oculto con los datos de su ficha en BC: precio, unidad y múltiplo de compra).
export async function articuloParaCarrito(bcItemNo: string) {
  if (!(await autorizado())) return { error: 'No autorizado.' };
  try {
    const p = await productoOcultoPorCodigo(bcItemNo);
    if (!p) return { error: `El artículo ${bcItemNo} no existe en Business Central.` };
    return {
      success: true,
      producto: {
        producto_id: p.id,
        nombre: p.nombre,
        imagen_url: p.imagen_url,
        multiplo_compra: p.multiplo_compra || 1,
        unidad_medida: p.unidad_medida,
      },
    };
  } catch (e: any) {
    return { error: e.message || 'No se pudo preparar el artículo.' };
  }
}
