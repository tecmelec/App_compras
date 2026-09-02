import { createClient } from '@/lib/supabase/server';
import ProductCard from '@/components/ProductCard';

export default async function TiendaPage() {
  const supabase = createClient();

  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen_url, categoria')
    .eq('visible', true)
    .order('categoria');

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-grafito">Tienda Tecmelec</h1>
        <p className="text-slate text-sm mt-1">
          Selecciona los artículos que necesitas y añádelos al carrito.
        </p>
      </div>

      {!productos || productos.length === 0 ? (
        <p className="text-slate text-sm">Todavía no hay productos publicados.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {productos.map((p) => (
            <ProductCard key={p.id} producto={p} />
          ))}
        </div>
      )}
    </div>
  );
}
