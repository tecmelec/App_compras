'use client';

import { useCart } from '@/context/CartContext';

// Comentarios u observaciones para el comprador: se guardan con el carrito y se envían
// con la solicitud (pedidos.comentarios_comprador).
export default function ComentariosCarrito() {
  const { comentarios, setComentarios } = useCart();
  return (
    <div data-tour="comentarios" className="bg-white border border-borde rounded-lg p-3 mt-4">
      <label htmlFor="comentarios-comprador" className="text-sm font-medium text-grafito">
        Comentarios al comprador <span className="text-xs text-slate font-normal">(opcional)</span>
      </label>
      <p className="text-xs text-slate mb-2">
        Observaciones para tener en cuenta al hacer el pedido: marca o proveedor preferido, urgencia, forma de entrega…
      </p>
      <textarea
        id="comentarios-comprador"
        value={comentarios}
        onChange={(e) => setComentarios(e.target.value)}
        maxLength={2000}
        rows={3}
        className="input w-full resize-y"
        placeholder="Escribe aquí tus comentarios para el comprador"
      />
    </div>
  );
}
