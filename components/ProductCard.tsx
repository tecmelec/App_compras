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
  multiplo_compra?: number | null;
};

function formatoPrecio(precio: number): string {
  return precio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function validarCantidad(cantidad: number, multiplo: number): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 'Indica una cantidad válida.';
  if (multiplo > 1 && cantidad % multiplo !== 0) {
    return `La cantidad debe ser múltiplo de ${multiplo}.`;
  }
  return null;
}

export default function ProductCard({
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
  const multiplo = producto.multiplo_compra && producto.multiplo_compra > 1 ? producto.multiplo_compra : 1;
  const [cantidad, setCantidad] = useState(multiplo);
  const [agregado, setAgregado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAdd() {
    const mensaje = validarCantidad(cantidad, multiplo);
    if (mensaje) {
      setError(mensaje);
      return;
    }
    setError(null);
    addItem(
      {
        producto_id: producto.id,
        nombre: producto.nombre,
        imagen_url: producto.imagen_url,
        multiplo_compra: producto.multiplo_compra,
        unidad_medida: producto.unidad_medida,
      },
      cantidad
    );
    setAgregado(true);
    setTimeout(() => setAgregado(false), 1500);
  }

  return (
    <div className="bg-white border border-borde rounded-lg overflow-hidden flex flex-col hover:shadow-md transition-shadow relative">
      {onToggleFavorito && (
        <button
          onClick={onToggleFavorito}
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-white/90 shadow-sm flex items-center justify-center hover:bg-white"
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

        {multiplo > 1 && (
          <div className="flex items-center gap-1.5 mt-2 text-xs">
            <span className="w-5 h-5 rounded-full bg-marcaClaro text-marca flex items-center justify-center shrink-0">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.73z" />
                <path d="M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12" />
              </svg>
            </span>
            <span className="text-marca font-medium">Múltiplo de {multiplo}</span>
            <span className="text-slate">
              (pedido mínimo {multiplo} {producto.unidad_medida || 'ud.'})
            </span>
          </div>
        )}

        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={() =>
                setCantidad((c) => {
                  const nueva = Math.max(multiplo, c - multiplo);
                  setError(null);
                  return nueva;
                })
              }
              className="btn-stepper"
              aria-label="Restar"
            >
              −
            </button>
            <input
              type="number"
              min={multiplo}
              step={multiplo}
              value={cantidad}
              onChange={(e) => {
                const valor = Number(e.target.value);
                setCantidad(valor);
                setError(validarCantidad(valor, multiplo));
              }}
              onFocus={(e) => e.target.select()}
              className="w-10 h-9 text-center border-y border-borde text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
            />
            <button
              type="button"
              onClick={() =>
                setCantidad((c) => {
                  setError(null);
                  return c + multiplo;
                })
              }
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

        {error && <p className="text-xs text-rojo mt-1.5">{error}</p>}
      </div>
    </div>
  );
}
