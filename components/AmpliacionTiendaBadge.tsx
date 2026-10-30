import { formatoCantidad } from '@/lib/cantidad';

// Tienda por proyecto: línea que supera lo autorizado para la obra. "ampliada" = ampliación
// autorizada; "pendiente" = exceso que el aprobador aún tiene que ajustar o aprobar.
export default function AmpliacionTiendaBadge({
  ampliada,
  pendiente,
  unidad,
  className = '',
}: {
  ampliada?: number | null;
  pendiente?: number | null;
  unidad?: string | null;
  className?: string;
}) {
  const u = unidad || 'ud.';
  if (pendiente && pendiente > 0)
    return (
      <span
        title="Supera la cantidad autorizada en la tienda del proyecto: el aprobador debe reducir la cantidad o aprobar la ampliación."
        className={`inline-block text-[11px] font-sans font-medium text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded px-1.5 py-0.5 ${className}`}
      >
        Ampliación pendiente de aprobar: +{formatoCantidad(pendiente)} {u}
      </span>
    );
  if (ampliada && ampliada > 0)
    return (
      <span
        title="Esta línea superó la cantidad máxima de la tienda del proyecto y se autorizó una ampliación."
        className={`inline-block text-[11px] font-sans font-medium text-[#5B3E8C] bg-[#EEE8F7] border border-[#DCD0EE] rounded px-1.5 py-0.5 ${className}`}
      >
        Ampliación: +{formatoCantidad(ampliada)} {u} sobre la tienda del proyecto
      </span>
    );
  return null;
}
