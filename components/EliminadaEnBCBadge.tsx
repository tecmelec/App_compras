// Marca de una línea cuyo artículo se ha borrado del pedido de compra en Business
// Central: la sincronización deja su cantidad a 0.
export default function EliminadaEnBCBadge({
  cantidadSolicitada,
  unidad,
  className = '',
}: {
  cantidadSolicitada: number | null;
  unidad?: string | null;
  className?: string;
}) {
  return (
    <span
      title="El artículo se ha borrado del pedido de compra directamente en Business Central."
      className={`inline-block text-[11px] font-sans font-medium text-[#B54A4A] bg-[#F6E9E9] border border-[#E7C7C7] rounded px-1.5 py-0.5 ${className}`}
    >
      Borrado del pedido en BC
      {cantidadSolicitada != null ? ` · se habían solicitado ${cantidadSolicitada} ${unidad || 'ud.'}` : ''}
    </span>
  );
}
