'use client';

import { useEffect, useRef, useState } from 'react';
import { ultimasComprasArticulo } from '@/app/actions/business-central';

type Compra = {
  pedido: string;
  cantidad: number;
  descripcion: string;
  proveedor: string | null;
  proyecto: string | null;
  precioUnitario: number;
};

function fmt(n: number, dec = 5) {
  return n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: dec });
}

// Lupa junto al precio: últimas 5 compras del artículo en BC (Líns. compra). Pulsar
// una fila pone su precio unitario en la línea (hay que guardar después).
export default function UltimasComprasBoton({
  bcItemNo,
  onUsarPrecio,
}: {
  bcItemNo: string | null;
  onUsarPrecio: (precio: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [compras, setCompras] = useState<Compra[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    function fuera(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAbierto(false);
    }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierto]);

  async function consultar() {
    if (abierto) {
      setAbierto(false);
      return;
    }
    setAbierto(true);
    if (compras || !bcItemNo) return;
    setCargando(true);
    setError(null);
    const r = await ultimasComprasArticulo(bcItemNo);
    setCargando(false);
    if (r.error) setError(r.error);
    else setCompras(r.compras || []);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={consultar}
        disabled={!bcItemNo}
        title={bcItemNo ? 'Últimas compras en Business Central' : 'El artículo no tiene código de BC'}
        aria-label="Últimas compras en Business Central"
        className="h-[34px] w-[34px] flex items-center justify-center rounded-md border border-borde bg-white text-slate hover:text-marca hover:border-marca disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>

      {abierto && (
        <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-1.5 z-30 w-[min(36rem,90vw)] bg-white border border-borde rounded-lg shadow-lg p-3">
          <p className="text-sm font-medium text-grafito mb-2">
            Últimas compras en BC <span className="font-mono text-slate text-xs">{bcItemNo}</span>
          </p>
          {cargando && <p className="text-xs text-slate">Consultando Business Central…</p>}
          {error && <p className="text-xs text-rojo">{error}</p>}
          {compras && compras.length === 0 && <p className="text-xs text-slate">No hay compras de este artículo en BC.</p>}
          {compras && compras.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate border-b border-borde">
                    <th className="py-1.5 pr-2 font-medium">Pedido</th>
                    <th className="py-1.5 pr-2 font-medium text-right">Cantidad</th>
                    <th className="py-1.5 pr-2 font-medium">Descripción</th>
                    <th className="py-1.5 font-medium text-right">Precio ud.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-borde">
                  {compras.map((c, i) => (
                    <tr
                      key={`${c.pedido}-${i}`}
                      onClick={() => {
                        onUsarPrecio(String(c.precioUnitario));
                        setAbierto(false);
                      }}
                      className="cursor-pointer hover:bg-fondo"
                      title="Usar este precio"
                    >
                      <td className="py-1.5 pr-2 font-mono text-grafito whitespace-nowrap">
                        {c.pedido}
                        {c.proveedor && <span className="block font-sans text-slate">{c.proveedor}</span>}
                      </td>
                      <td className="py-1.5 pr-2 font-mono text-right">{fmt(c.cantidad, 3)}</td>
                      <td className="py-1.5 pr-2 text-grafito">{c.descripcion}</td>
                      <td className="py-1.5 font-mono text-right whitespace-nowrap">{fmt(c.precioUnitario)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[11px] text-slate mt-2">
                Precio ud. = importe de línea excl. IVA / cantidad. Pulsa una fila para usar su precio (después, guarda).
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
