// Marca de una línea que no se pidió desde la app: se añadió directamente en el
// pedido de compra de Business Central y la sincronización la incorporó.
export default function AnadidaEnBCBadge({ className = '' }: { className?: string }) {
  return (
    <span
      title="Esta línea no se solicitó desde la app: se añadió directamente en el pedido de compra de Business Central."
      className={`inline-block text-[11px] font-sans font-medium text-[#2F6690] bg-[#EAF1F6] border border-[#C7DBE7] rounded px-1.5 py-0.5 ${className}`}
    >
      Añadida en BC, no solicitada desde la app
    </span>
  );
}
