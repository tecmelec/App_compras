'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useCart } from '@/context/CartContext';

type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  categoria: string | null;
  precio?: number;
};

export default function ProductCard({
  producto,
  mostrarPrecio,
}: {
  producto: Producto;
  mostrarPrecio?: boolean;
}) {
  const { addItem } = useCart();
  const [cantidad, setCantidad] = useState(1);
  const [agregado, setAgregado] = useState(false);

  function handleAdd() {
    addItem(
      { producto_id: producto.id, nombre: producto.nombre, imagen_url: producto.imagen_url },
      cantidad
    );
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  }

  return (
    <div className="bg-white border border-borde rounded-lg overflow-hidden flex flex-col">
      <div className="aspect-square bg-fondo relative">
        {producto.imagen_url ? (
          <Image src={producto.imagen_url} alt={producto.nombre} fill className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate text-sm">
            Sin imagen
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        {producto.categoria && (
          <span className="text-xs text-acero font-medium mb-1">{producto.categoria}</span>
        )}
        <h3 className="font-medium text-grafito leading-snug">{producto.nombre}</h3>
        {mostrarPrecio && producto.precio !== undefined && (
          <p className="text-sm font-mono text-acero mt-0.5">{producto.precio.toFixed(2)} €</p>
        )}
        {producto.descripcion && (
          <p className="text-sm text-slate mt-1 flex-1">{producto.descripcion}</p>
        )}

        <div className="flex items-center gap-2 mt-4">
          <input
            type="number"
            min={1}
            value={cantidad}
            onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
            onFocus={(e) => e.target.select()}
            className="input w-20"
          />
          <button onClick={handleAdd} className="btn-primary flex-1">
            {agregado ? 'Añadido ✓' : 'Añadir al carrito'}
          </button>
        </div>
      </div>
    </div>
  );
}
