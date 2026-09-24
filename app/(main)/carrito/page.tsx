'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { crearPedido } from '@/app/actions/pedidos';
import SolicitudModal from './SolicitudModal';

function validarCantidad(cantidad: number, multiplo: number): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 'Indica una cantidad válida.';
  if (multiplo > 1 && cantidad % multiplo !== 0) {
    return `Debe ser múltiplo de ${multiplo}.`;
  }
  return null;
}

export default function CarritoPage() {
  const { items, updateCantidad, removeItem, clear } = useCart();
  const [mostrarModal, setMostrarModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const erroresPorItem = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const item of items) {
      const multiplo = item.multiplo_compra && item.multiplo_compra > 1 ? item.multiplo_compra : 1;
      const mensaje = validarCantidad(item.cantidad, multiplo);
      if (mensaje) mapa.set(item.producto_id, mensaje);
    }
    return mapa;
  }, [items]);

  const hayErrores = erroresPorItem.size > 0;

  async function handleConfirmar(datos: {
    proyecto_id: string;
    nombre_contacto: string;
    telefono_contacto: string;
    direccion_entrega_id: string;
    fecha_requerida: string;
    comprador_id: string | null;
    seguir_pedido: boolean;
  }) {
    setEnviando(true);
    setError(null);

    const resultado = await crearPedido(items, datos);

    setEnviando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setMostrarModal(false);
    clear();
    router.push(`/mis-pedidos?creado=${resultado.numeroApp}`);
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold text-grafito mb-6">Carrito</h1>

      {items.length === 0 ? (
        <p className="text-slate text-sm">
          Tu carrito está vacío. Ve a la{' '}
          <a href="/tienda" className="text-marca underline">
            tienda
          </a>{' '}
          para añadir artículos.
        </p>
      ) : (
        <>
          <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
            {items.map((item) => {
              const multiplo = item.multiplo_compra && item.multiplo_compra > 1 ? item.multiplo_compra : 1;
              const errorItem = erroresPorItem.get(item.producto_id);
              return (
                <div key={item.producto_id} className="flex items-center gap-4 p-4">
                  <div className="w-14 h-14 bg-fondo rounded-md relative shrink-0 overflow-hidden">
                    {item.imagen_url && (
                      <Image src={item.imagen_url} alt={item.nombre} fill className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-grafito truncate">{item.nombre}</p>
                    {multiplo > 1 && (
                      <p className="text-xs mt-0.5">
                        <span className="text-marca font-medium">Múltiplo de {multiplo}</span>{' '}
                        <span className="text-slate">
                          (pedido mínimo {multiplo} {item.unidad_medida || 'ud.'})
                        </span>
                      </p>
                    )}
                    {errorItem && <p className="text-xs text-rojo mt-0.5">{errorItem}</p>}
                  </div>
                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCantidad(item.producto_id, Math.max(multiplo, item.cantidad - multiplo))}
                      className="btn-stepper"
                      aria-label="Restar"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={multiplo}
                      step={multiplo}
                      value={item.cantidad}
                      onChange={(e) => updateCantidad(item.producto_id, Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-16 h-9 text-center border-y border-borde text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateCantidad(item.producto_id, item.cantidad + multiplo)}
                      className="btn-stepper"
                      aria-label="Sumar"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.producto_id)}
                    className="text-sm text-rojo hover:underline shrink-0"
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4">
              {error}
            </p>
          )}

          <button
            onClick={() => setMostrarModal(true)}
            disabled={hayErrores}
            title={hayErrores ? 'Corrige las cantidades marcadas antes de continuar.' : undefined}
            className="btn-primary mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Solicitar materiales
          </button>
        </>
      )}

      {mostrarModal && (
        <SolicitudModal
          onCancel={() => setMostrarModal(false)}
          onConfirmar={handleConfirmar}
          enviando={enviando}
        />
      )}
    </div>
  );
}
