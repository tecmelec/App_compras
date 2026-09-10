import { createClient } from '@/lib/supabase/server';
import { Suspense } from 'react';
import TiendaClient from './TiendaClient';
import HeroTienda from '@/components/HeroTienda';

export default async function TiendaPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: perfil } = await supabase
    .from('profiles')
    .select('rol')
    .eq('id', user?.id)
    .single();

  const mostrarPrecio = perfil?.rol === 'admin' || perfil?.rol === 'comprador' || perfil?.rol === 'responsable';

  const { data: productos } = await supabase
    .from('productos')
    .select('id, nombre, descripcion, imagen_url, categoria, precio, bc_item_no, unidad_medida')
    .eq('visible', true)
    .order('categoria');

  const { data: favoritos } = await supabase
    .from('favoritos')
    .select('producto_id')
    .eq('usuario_id', user?.id);

  const favoritosIds = (favoritos || []).map((f) => f.producto_id);

  return (
    <div className="p-8">
      <HeroTienda />

      {!productos || productos.length === 0 ? (
        <p className="text-slate text-sm">Todavía no hay productos publicados.</p>
      ) : (
        <Suspense fallback={<p className="text-slate text-sm">Cargando…</p>}>
          <TiendaClient productos={productos} mostrarPrecio={mostrarPrecio} favoritosIniciales={favoritosIds} />
        </Suspense>
      )}
    </div>
  );
}
