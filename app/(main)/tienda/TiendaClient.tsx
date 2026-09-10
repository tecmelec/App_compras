'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import ProductRow from '@/components/ProductRow';
import { marcarFavorito, quitarFavorito } from '@/app/actions/favoritos';

type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  categoria: string | null;
  precio?: number;
  bc_item_no?: string | null;
  unidad_medida?: string | null;
};

export default function TiendaClient({
  productos,
  mostrarPrecio,
  favoritosIniciales,
}: {
  productos: Producto[];
  mostrarPrecio: boolean;
  favoritosIniciales: string[];
}) {
  const searchParams = useSearchParams();
  const busqueda = searchParams.get('q') || '';
  const [vista, setVista] = useState<'grid' | 'list'>('grid');
  const [favoritos, setFavoritos] = useState<Set<string>>(new Set(favoritosIniciales));

  function alternarFavorito(productoId: string) {
    const esFavorito = favoritos.has(productoId);

    // Actualización optimista: se ve al instante, sin esperar al servidor
    setFavoritos((prev) => {
      const nuevo = new Set(prev);
      if (esFavorito) nuevo.delete(productoId);
      else nuevo.add(productoId);
      return nuevo;
    });

    if (esFavorito) quitarFavorito(productoId);
    else marcarFavorito(productoId);
  }

  const filtrados = useMemo(() => {
    const palabras = busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (palabras.length === 0) return productos;
    return productos.filter((p) => {
      const texto = [p.nombre, p.descripcion, p.categoria, p.bc_item_no]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return palabras.every((palabra) => texto.includes(palabra));
    });
  }, [productos, busqueda]);

  // Los favoritos van siempre primero, conservando el resto del orden
  const ordenados = useMemo(() => {
    return [...filtrados].sort((a, b) => {
      const favA = favoritos.has(a.id) ? 0 : 1;
      const favB = favoritos.has(b.id) ? 0 : 1;
      return favA - favB;
    });
  }, [filtrados, favoritos]);

  return (
    <div>
      <div className="mb-5 flex justify-end">
        <div className="flex items-center border border-borde rounded-lg overflow-hidden shrink-0">
          <button
            onClick={() => setVista('grid')}
            className={`w-9 h-9 flex items-center justify-center ${vista === 'grid' ? 'bg-marcaClaro text-marca' : 'text-slate hover:bg-fondo'}`}
            aria-label="Vista de cuadrícula"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <button
            onClick={() => setVista('list')}
            className={`w-9 h-9 flex items-center justify-center border-l border-borde ${vista === 'list' ? 'bg-marcaClaro text-marca' : 'text-slate hover:bg-fondo'}`}
            aria-label="Vista de lista"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {ordenados.length === 0 ? (
        <p className="text-slate text-sm">No hay productos que coincidan con la búsqueda.</p>
      ) : vista === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {ordenados.map((p) => (
            <ProductCard
              key={p.id}
              producto={p}
              mostrarPrecio={mostrarPrecio}
              esFavorito={favoritos.has(p.id)}
              onToggleFavorito={() => alternarFavorito(p.id)}
            />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
          {ordenados.map((p) => (
            <ProductRow
              key={p.id}
              producto={p}
              mostrarPrecio={mostrarPrecio}
              esFavorito={favoritos.has(p.id)}
              onToggleFavorito={() => alternarFavorito(p.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
