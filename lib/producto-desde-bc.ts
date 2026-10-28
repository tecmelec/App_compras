import { createAdminClient } from '@/lib/supabase/admin';
import { obtenerItemBC } from '@/lib/business-central';

// Artículo de BC → producto de la app (se crea oculto si no existe). Lo usan "Asignar
// artículo" de las listas y "Añadir artículo" del aprobador.
export async function productoDesdeBC(
  bcItemNo: string
): Promise<{ producto: { id: string; nombre: string; precio: number; multiplo_compra: number; proveedor_predeterminado_id: string | null } } | { error: string }> {
  let item;
  try {
    item = await obtenerItemBC(bcItemNo);
  } catch (e: any) {
    return { error: 'No se pudo consultar Business Central: ' + (e.message || '') };
  }
  if (!item) return { error: `El artículo ${bcItemNo} no existe en Business Central.` };
  const admin = createAdminClient();
  const { data: existente } = await admin
    .from('productos')
    .select('id, nombre, precio, multiplo_compra, proveedor_predeterminado_id')
    .eq('bc_item_no', item.No)
    .maybeSingle();
  if (existente) return { producto: existente as any };
  const { data: proveedorBC } = item.Vendor_No
    ? await admin.from('proveedores').select('id').eq('bc_proveedor_no', item.Vendor_No).maybeSingle()
    : { data: null };
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
      ...(proveedorBC?.id ? { proveedor_predeterminado_id: proveedorBC.id } : {}),
    })
    .select('id, nombre, precio, multiplo_compra, proveedor_predeterminado_id')
    .single();
  if (error || !nuevo) return { error: 'No se pudo dar de alta el artículo en la app: ' + (error?.message || '') };
  return { producto: nuevo as any };
}
