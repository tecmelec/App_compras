type EstadoDef = { id: number; nombre: string; orden: number };

export default function ProgresoEstado({
  estados,
  estadoActualId,
  notas,
}: {
  estados: EstadoDef[];
  estadoActualId: number | null;
  // Texto en gris claro bajo un paso ya alcanzado, por nombre del estado en minúsculas
  // (p. ej. quién aprobó la solicitud bajo "Solicitud aprobada").
  notas?: Record<string, string>;
}) {
  const actual = estados.find((e) => e.id === estadoActualId);
  const esAnulado = actual?.nombre?.trim().toLowerCase() === 'anulado';

  if (esAnulado) {
    return (
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full bg-rojo inline-block" />
        <span className="font-medium text-rojo">Anulado</span>
      </div>
    );
  }

  const ordenados = [...estados]
    .filter((e) => e.nombre.trim().toLowerCase() !== 'anulado')
    .sort((a, b) => a.orden - b.orden);
  const indiceActual = ordenados.findIndex((e) => e.id === estadoActualId);

  return (
    <div className="flex items-start overflow-x-auto">
      {ordenados.map((e, i) => {
        const alcanzado = indiceActual >= 0 && i <= indiceActual;
        const esUltimoDeLista = i === ordenados.length - 1;
        return (
          <div key={e.id} className={`flex items-center ${esUltimoDeLista ? '' : 'flex-1'}`}>
            <div className="flex flex-col items-center shrink-0 w-28">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                  alcanzado ? 'bg-marca text-white' : 'bg-white border-2 border-borde text-slate'
                }`}
              >
                {alcanzado && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <p className={`text-xs text-center mt-2 ${alcanzado ? 'text-grafito font-medium' : 'text-slate'}`}>
                {e.nombre}
              </p>
              {alcanzado && notas?.[e.nombre.trim().toLowerCase()] && (
                <p className="text-[11px] text-center text-slate/70 mt-0.5 leading-tight">
                  {notas[e.nombre.trim().toLowerCase()]}
                </p>
              )}
            </div>
            {!esUltimoDeLista && (
              <div className={`h-0.5 flex-1 mt-4 ${i < indiceActual ? 'bg-marca' : 'bg-borde'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
