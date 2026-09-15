'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { previsualizarPedidoCompraBC, crearPedidosCompraBC } from '@/app/actions/business-central';

type Grupo = {
  proveedorId: string;
  proveedorNombre: string;
  proveedorBcNo?: string;
  items: { id: string; nombre: string; bcItemNo?: string; cantidad: number; precio: number }[];
  subtotal: number;
};

type Previa = {
  numeroApp: string;
  jobNo: string | null;
  contacto: string | null;
  direccion: { direccion: string; ciudad: string; provincia: string; codigoPostal: string } | null;
  grupos: Grupo[];
  sinProveedor: string[];
  sinCodigoBC: string[];
  yaVinculadas: string[];
};

export default function CrearPedidoBCBoton({ pedidoId }: { pedidoId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [creando, setCreando] = useState(false);
  const [resultado, setResultado] = useState<{ creados: { proveedor: string; documentNo: string }[]; errores: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleAbrir() {
    setAbierto(true);
    setCargando(true);
    setPrevia(null);
    setResultado(null);
    setError(null);

    const r = await previsualizarPedidoCompraBC(pedidoId);
    setCargando(false);
    setPrevia(r as Previa);
  }

  async function handleConfirmar() {
    setCreando(true);
    setError(null);

    const r = await crearPedidosCompraBC(pedidoId);

    setCreando(false);

    if (r.error) {
      setError(r.error);
      return;
    }

    setResultado({ creados: r.creados || [], errores: r.errores || [] });
    router.refresh();
  }

  return (
    <>
      <button onClick={handleAbrir} className="btn-primary whitespace-nowrap">
        + Crear pedido en BC
      </button>

      {abierto && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4" onClick={() => setAbierto(false)}>
          <div
            className="bg-white rounded-xl max-w-2xl w-full max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-grafito mb-1">Crear pedido de compra en Business Central</h3>

            {cargando && <p className="text-sm text-slate">Calculando qué se va a crear…</p>}

            {previa && !resultado && (
              <>
                {previa.grupos.length === 0 ? (
                  <p className="text-sm text-slate mt-3">
                    No hay artículos listos para crear un pedido de compra (revisa que tengan proveedor asignado y
                    que el producto tenga código de Business Central).
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-slate mt-1 mb-4">
                      Se va a crear {previa.grupos.length === 1 ? 'un pedido de compra' : `${previa.grupos.length} pedidos de compra (uno por proveedor)`} en
                      Business Central, con "Su Referencia" = <span className="font-mono">{previa.numeroApp}</span>
                      {previa.jobNo && (
                        <>
                          {' '}y proyecto <span className="font-mono">{previa.jobNo}</span> en cada línea
                        </>
                      )}
                      .
                    </p>

                    {previa.direccion && (
                      <p className="text-xs text-slate mb-4 bg-fondo border border-borde rounded-md px-3 py-2">
                        Dirección de envío: {previa.contacto ? `${previa.contacto} — ` : ''}
                        {previa.direccion.direccion}
                        {previa.direccion.codigoPostal ? `, CP ${previa.direccion.codigoPostal}` : ''}
                        {previa.direccion.ciudad ? `, ${previa.direccion.ciudad}` : ''}
                        {previa.direccion.provincia ? ` (${previa.direccion.provincia})` : ''}
                      </p>
                    )}

                    <div className="space-y-4 mb-4">
                      {previa.grupos.map((g) => (
                        <div key={g.proveedorId} className="border border-borde rounded-lg overflow-hidden">
                          <div className="bg-fondo px-4 py-2 text-sm font-medium text-grafito">{g.proveedorNombre}</div>
                          <table className="w-full text-sm">
                            <tbody className="divide-y divide-borde">
                              {g.items.map((it) => (
                                <tr key={it.id}>
                                  <td className="px-4 py-2 text-grafito">{it.nombre}</td>
                                  <td className="px-4 py-2 font-mono text-slate text-right">x{it.cantidad}</td>
                                  <td className="px-4 py-2 font-mono text-slate text-right">
                                    {it.precio.toFixed(2)} €
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          <div className="px-4 py-2 text-right text-sm font-mono text-grafito border-t border-borde">
                            Subtotal: {g.subtotal.toFixed(2)} €
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {previa.sinProveedor.length > 0 && (
                  <p className="text-xs text-slate bg-fondo border border-borde rounded-md px-3 py-2 mb-2">
                    ⚠ Sin proveedor asignado, no se incluyen: {previa.sinProveedor.join(', ')}
                  </p>
                )}
                {previa.sinCodigoBC.length > 0 && (
                  <p className="text-xs text-slate bg-fondo border border-borde rounded-md px-3 py-2 mb-2">
                    ⚠ Sin código de artículo BC, no se incluyen: {previa.sinCodigoBC.join(', ')}
                  </p>
                )}
                {previa.yaVinculadas.length > 0 && (
                  <p className="text-xs text-slate bg-fondo border border-borde rounded-md px-3 py-2 mb-2">
                    ℹ Ya tienen Nº pedido Tecmelec asignado, no se incluyen: {previa.yaVinculadas.join(', ')}
                  </p>
                )}

                {error && (
                  <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">
                    {error}
                  </p>
                )}

                <div className="flex items-center gap-3">
                  {previa.grupos.length > 0 && (
                    <button onClick={handleConfirmar} disabled={creando} className="btn-primary">
                      {creando ? 'Creando en Business Central…' : 'Confirmar y crear en Business Central'}
                    </button>
                  )}
                  <button onClick={() => setAbierto(false)} className="btn-secondary">
                    Cancelar
                  </button>
                </div>
              </>
            )}

            {resultado && (
              <div className="mt-2">
                {resultado.creados.map((c, i) => (
                  <p key={i} className="text-sm text-verde mb-1">
                    ✓ {c.proveedor}: pedido <span className="font-mono">{c.documentNo}</span> creado en BC.
                  </p>
                ))}
                {resultado.errores.map((a, i) => (
                  <p key={i} className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">
                    {a}
                  </p>
                ))}
                <button onClick={() => setAbierto(false)} className="btn-secondary mt-4">
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
