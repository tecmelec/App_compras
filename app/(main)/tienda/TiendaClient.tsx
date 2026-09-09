'use client';

import { useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import ProductCard from '@/components/ProductCard';
import ProductRow from '@/components/ProductRow';

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
}: {
  productos: Producto[];
  mostrarPrecio: boolean;
}) {
  const searchParams = useSearchParams();
  const busqueda = searchParams.get('q') || '';
  const [vista, setVista] = useState<'grid' | 'list'>('grid');

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

      {filtrados.length === 0 ? (
        <p className="text-slate text-sm">No hay productos que coincidan con la búsqueda.</p>
      ) : vista === 'grid' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtrados.map((p) => (
            <ProductCard key={p.id} producto={p} mostrarPrecio={mostrarPrecio} />
          ))}
        </div>
      ) : (
        <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
          {filtrados.map((p) => (
            <ProductRow key={p.id} producto={p} mostrarPrecio={mostrarPrecio} />
          ))}
        </div>
      )}
    </div>
  );
}
