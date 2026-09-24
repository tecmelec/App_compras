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
          {multiplo > 1 && (
            <p className="text-xs mt-0.5">
              <span className="text-marca font-medium">Múltiplo de {multiplo}</span>{' '}
              <span className="text-slate">
                (pedido mínimo {multiplo} {producto.unidad_medida || 'ud.'})
              </span>
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
          {mostrarPrecio && producto.precio !== undefined && (
            <p className="text-sm font-semibold text-grafito whitespace-nowrap">
              {formatoPrecio(producto.precio)} €
              <span className="text-xs font-normal text-slate"> /{producto.unidad_medida || 'ud.'}</span>
            </p>
          )}

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

          <button onClick={handleAdd} className="btn-primary shrink-0 whitespace-nowrap px-4">
            {agregado ? '✓ Añadido' : 'Añadir'}
          </button>
        </div>

        {error && <p className="text-xs text-rojo">{error}</p>}
      </div>
    </div>
  );
}
