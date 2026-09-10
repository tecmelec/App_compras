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

export default function ProductRow({
  producto,
  mostrarPrecio,
  esFavorito,
  onToggleFavorito,
}: {
  producto: Producto;
  mostrarPrecio?: boolean;
  esFavorito?: boolean;
  onToggleFavorito?: () => void;
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
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {onToggleFavorito && (
          <button
            onClick={onToggleFavorito}
            className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center hover:bg-fondo"
            aria-label={esFavorito ? 'Quitar de favoritos' : 'Marcar como favorito'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={esFavorito ? '#178A4C' : 'none'}
              stroke={esFavorito ? '#178A4C' : '#5B6470'}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        )}
        <div className="w-14 h-14 bg-fondo rounded relative shrink-0 overflow-hidden">
          {producto.imagen_url ? (
            <Image src={producto.imagen_url} alt={producto.nombre} fill className="object-contain" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate text-[10px]">Sin foto</div>
          )}
        </div>

        <div className="min-w-0">
          {producto.categoria && <p className="text-xs text-marca font-medium">{producto.categoria}</p>}
          <p className="font-medium text-grafito truncate">{producto.nombre}</p>
          {producto.bc_item_no && <p className="text-xs text-slate">Ref. {producto.bc_item_no}</p>}
        </div>
      </div>

      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
        {mostrarPrecio && producto.precio !== undefined && (
          <p className="text-sm font-semibold text-grafito whitespace-nowrap">
            {formatoPrecio(producto.precio)} €
            <span className="text-xs font-normal text-slate"> /{producto.unidad_medida || 'ud.'}</span>
          </p>
        )}

        <div className="flex items-center shrink-0">
          <button type="button" onClick={() => setCantidad((c) => Math.max(1, c - 1))} className="btn-stepper" aria-label="Restar">
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
          <button type="button" onClick={() => setCantidad((c) => c + 1)} className="btn-stepper" aria-label="Sumar">
            +
          </button>
        </div>

        <button onClick={handleAdd} className="btn-primary shrink-0 whitespace-nowrap px-4">
          {agregado ? '✓ Añadido' : 'Añadir'}
        </button>
      </div>
    </div>
  );
}
