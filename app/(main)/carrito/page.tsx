'use client';

import { useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { crearPedido } from '@/app/actions/pedidos';
import SolicitudModal from './SolicitudModal';

export default function CarritoPage() {
  const { items, updateCantidad, removeItem, clear } = useCart();
  const [mostrarModal, setMostrarModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleConfirmar(datos: {
    nombre_contacto: string;
    telefono_contacto: string;
    direccion_entrega_id: string;
    fecha_requerida: string;
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
          <a href="/tienda" className="text-acero underline">
            tienda
          </a>{' '}
          para añadir artículos.
        </p>
      ) : (
        <>
          <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
            {items.map((item) => (
              <div key={item.producto_id} className="flex items-center gap-4 p-4">
                <div className="w-14 h-14 bg-fondo rounded-md relative shrink-0 overflow-hidden">
                  {item.imagen_url && (
                    <Image src={item.imagen_url} alt={item.nombre} fill className="object-cover" />
                  )}
                </div>
                <p className="flex-1 text-sm font-medium text-grafito">{item.nombre}</p>
                <input
                  type="number"
                  min={1}
                  value={item.cantidad}
                  onChange={(e) => updateCantidad(item.producto_id, Number(e.target.value))}
                  className="input w-20"
                />
                <button
                  onClick={() => removeItem(item.producto_id)}
                  className="text-sm text-rojo hover:underline"
                >
                  Quitar
                </button>
              </div>
            ))}
          </div>

          {error && (
            <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4">
              {error}
            </p>
          )}

          <button onClick={() => setMostrarModal(true)} className="btn-primary mt-6">
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
