'use client';

import { useMemo, useState } from 'react';
import ProductCard from '@/components/ProductCard';

type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  categoria: string | null;
  precio?: number;
};

export default function TiendaClient({
  productos,
  mostrarPrecio,
}: {
  productos: Producto[];
  mostrarPrecio: boolean;
}) {
  const [busqueda, setBusqueda] = useState('');

  const filtrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    if (!texto) return productos;
    return productos.filter(
      (p) =>
        p.nombre.toLowerCase().includes(texto) ||
        (p.descripcion || '').toLowerCase().includes(texto) ||
        (p.categoria || '').toLowerCase().includes(texto)
    );
  }, [productos, busqueda]);

  return (
    <div>
      <div className="mb-5 max-w-md">
        <input
          className="input"
          placeholder="Buscar por nombre, descripción o categoría..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </div>

      {filtrados.length === 0 ? (
        <p className="text-slate text-sm">No hay productos que coincidan con la búsqueda.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtrados.map((p) => (
            <ProductCard key={p.id} producto={p} mostrarPrecio={mostrarPrecio} />
          ))}
        </div>
      )}
    </div>
  );
}
