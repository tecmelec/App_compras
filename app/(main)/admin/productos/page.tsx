import { createClient } from '@/lib/supabase/server';
import ProductosClient from './ProductosClient';
import SincronizarBCBoton from './SincronizarBCBoton';
import DepurarBCBoton from './DepurarBCBoton';

export default async function ProductosAdminPage() {
  const supabase = createClient();

  const { data: productos } = await supabase
    .from('productos')
    .select(
      'id, nombre, descripcion, imagen_url, categoria, visible, precio, unidad_medida, bc_item_no, proveedor_predeterminado_id'
    )
    .order('categoria');

  const { data: proveedores } = await supabase
    .from('proveedores')
    .select('id, bc_proveedor_no, nombre')
    .order('nombre');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Productos</h1>
      <p className="text-slate text-sm mb-6">Catálogo de la Tienda Tecmelec.</p>

      <SincronizarBCBoton />
      <DepurarBCBoton />
      <ProductosClient productos={productos || []} proveedores={proveedores || []} />
    </div>
  );
}
