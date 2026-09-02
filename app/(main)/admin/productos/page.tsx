import { createClient } from '@/lib/supabase/server';
import ProductosClient from './ProductosClient';

export default async function ProductosAdminPage() {
  const supabase = createClient();

  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen_url, categoria, visible')
    .order('categoria');

  return (
    <div className="p-8">
      <h1 className="text-2xl font-semibold text-grafito mb-1">Productos</h1>
      <p className="text-slate text-sm mb-6">Catálogo de la Tienda Tecmelec.</p>

      <ProductosClient productos={productos || []} />
    </div>
  );
}
