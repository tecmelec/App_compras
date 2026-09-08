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
  bc_item_no?: string | null;
  unidad_medida?: string | null;
};

function formatoPrecio(precio: number): string {
  return precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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
    <div className="bg-white border border-borde rounded-lg overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="h-28 bg-fondo relative">
        {producto.imagen_url ? (
          <Image src={producto.imagen_url} alt={producto.nombre} fill className="object-contain" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate text-sm">
            Sin imagen
          </div>
        )}
      </div>

      <div className="p-4 flex flex-col flex-1">
        {producto.categoria && (
          <span className="text-xs text-marca font-medium mb-1">{producto.categoria}</span>
        )}
        <h3 className="font-medium text-grafito leading-snug">{producto.nombre}</h3>
        {producto.bc_item_no && (
          <p className="text-xs text-slate mt-0.5">Ref. {producto.bc_item_no}</p>
        )}
        {producto.descripcion && (
          <p className="text-sm text-slate mt-1 flex-1">{producto.descripcion}</p>
        )}
        {mostrarPrecio && producto.precio !== undefined && (
          <p className="text-base font-semibold text-grafito mt-2">
            {formatoPrecio(producto.precio)} €{' '}
            <span className="text-xs font-normal text-slate">/ {producto.unidad_medida || 'ud.'}</span>
          </p>
        )}

        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() => setCantidad((c) => Math.max(1, c - 1))}
              className="btn-stepper"
              aria-label="Restar"
            >
              −
            </button>
            <input
              type="number"
              min={1}
              value={cantidad}
              onChange={(e) => setCantidad(Math.max(1, Number(e.target.value)))}
              onFocus={(e) => e.target.select()}
              className="w-10 h-9 text-center border-y border-borde text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() => setCantidad((c) => c + 1)}
              className="btn-stepper"
              aria-label="Sumar"
            >
              +
            </button>
          </div>
          <button
            onClick={handleAdd}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
            aria-label="Añadir al carrito"
          >
            {agregado ? (
              '✓ Añadido'
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
                Añadir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
