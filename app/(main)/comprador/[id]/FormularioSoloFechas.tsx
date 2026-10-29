'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { guardarFechasSeguidorIA } from '@/app/actions/seguidor-ia';
import EstadoBadge, { claseBadgeEstado } from '@/components/EstadoBadge';
import { formatoCantidad } from '@/lib/cantidad';
import { quienConfirmoFecha } from '@/components/FechaEntregaIndicadores';
import type { ItemForm } from './FormularioComprador';

// Vista del perfil "Seguidor IA": las líneas de la solicitud en solo lectura y, en cada
// una, la "Fecha estimada de entrega" editable. "Guardar fechas" solo envía las que han
// cambiado; cada una queda con el check azul "Confirmada por el Seguidor IA" y su hora.
export default function FormularioSoloFechas({
  pedidoId,
  items,
  proveedores,
}: {
  pedidoId: string;
  items: ItemForm[];
  proveedores: { id: string; bc_proveedor_no: string; nombre: string | null }[];
}) {
  const router = useRouter();
  const [fechas, setFechas] = useState<Record<string, string>>(Object.fromEntries(items.map((i) => [i.id, i.fechaEstimada || ''])));
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ ok: boolean; texto: string } | null>(null);
  const nombreProveedor = (id: string) => {
    const p = proveedores.find((x) => x.id === id);
    return p ? `${p.bc_proveedor_no} — ${p.nombre || ''}` : '';
  };

  // Agrupa por Nº de pedido Tecmelec (las líneas sin pedido van al final).
  const grupos = useMemo(() => {
    const m = new Map<string, ItemForm[]>();
    for (const i of items) m.set(i.numeroTecmelec || '', [...(m.get(i.numeroTecmelec || '') || []), i]);
    return Array.from(m.entries()).sort((a, b) => (a[0] === '' ? 1 : b[0] === '' ? -1 : a[0].localeCompare(b[0])));
  }, [items]);

  const cambios = items.filter((i) => fechas[i.id] && fechas[i.id] !== (i.fechaEstimada || ''));

  async function guardar() {
    setGuardando(true);
    setMensaje(null);
    const r = await guardarFechasSeguidorIA(
      pedidoId,
      cambios.map((i) => ({ itemId: i.id, fecha: fechas[i.id] }))
    );
    setGuardando(false);
    if ('error' in r && r.error) {
      setMensaje({ ok: false, texto: r.error });
      return;
    }
    setMensaje({ ok: true, texto: `Guardado ✓ (${(r as any).guardadas ?? cambios.length} fecha(s) actualizada(s))` });
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <h2 className="font-medium text-grafito">Artículos solicitados</h2>
      {grupos.map(([pedido, lista]) => (
        <div key={pedido || 'sin-pedido'} className="bg-white border border-borde rounded-lg overflow-hidden">
          <div className="bg-fondo px-4 py-2.5 flex items-center justify-between flex-wrap gap-2">
            <span className="text-sm text-grafito">
              {pedido ? (
                <>
                  Pedido <span className="font-mono">{pedido}</span>
                  {lista[0].proveedorId && <span className="text-slate"> · {nombreProveedor(lista[0].proveedorId)}</span>}
                </>
              ) : (
                'Sin pedido de compra'
              )}
            </span>
            <span className="text-xs text-slate">{lista.length} artículo(s)</span>
          </div>
          <ul className="divide-y divide-borde">
            {lista.map((i) => {
              const conf = quienConfirmoFecha(i.fechaConfirmadaEn, i.fechaSeguidorEn);
              const sinCambiar = fechas[i.id] === (i.fechaEstimada || '');
              return (
                <li key={i.id} className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <div className="w-10 h-10 relative bg-fondo rounded shrink-0 overflow-hidden">
                    {i.imagenUrl && <Image src={i.imagenUrl} alt="" fill className="object-contain" />}
                  </div>
                  <div className="flex-1 min-w-[14rem]">
                    <p className="text-sm text-grafito">{i.nombre}</p>
                    <p className="text-xs text-slate">
                      {i.bcItemNo ? <span className="font-mono mr-2">{i.bcItemNo}</span> : null}
                      {formatoCantidad(i.cantidad)} {i.unidad}
                    </p>
                  </div>
                  <EstadoBadge estado={i.estadoRecepcion} />
                  <div>
                    <p className="text-xs text-slate mb-1">Fecha estimada de entrega</p>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="date"
                        aria-label={`Fecha estimada de entrega de ${i.nombre}`}
                        className="input w-40 py-1"
                        value={fechas[i.id] || ''}
                        onChange={(e) => {
                          setMensaje(null);
                          setFechas((prev) => ({ ...prev, [i.id]: e.target.value }));
                        }}
                      />
                      {conf && sinCambiar && (
                        <span
                          title={`${conf.quien === 'seguidor' ? 'Confirmada por el Seguidor IA' : 'Confirmada por el proveedor'} el ${new Date(conf.en).toLocaleString('es-ES', {
                            dateStyle: 'short',
                            timeStyle: 'short',
                          })}`}
                          className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                            conf.quien === 'seguidor' ? 'bg-[#DBEAFE] text-[#1D4ED8]' : 'bg-marcaClaro text-marca'
                          }`}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        </span>
                      )}
                    </div>
                    {conf && sinCambiar && (
                      <p className={`text-[11px] mt-1 ${conf.quien === 'seguidor' ? 'text-[#1D4ED8]' : 'text-slate'}`}>
                        {conf.quien === 'seguidor' ? 'Confirmada por el Seguidor IA · ' : 'Confirmada por el proveedor · '}
                        {new Date(conf.en).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {mensaje && (
        <p className={`text-sm rounded-md px-3 py-2 ${mensaje.ok ? 'text-[#047857] bg-[#F3FBF6] border border-[#A7E3C4]' : 'text-rojo bg-[#F6E9E9] border border-[#E7C7C7]'}`}>
          {mensaje.texto}
        </p>
      )}
      <button onClick={guardar} disabled={guardando || cambios.length === 0} className="btn-primary disabled:opacity-60">
        {guardando ? 'Guardando…' : cambios.length > 0 ? `Guardar fechas (${cambios.length})` : 'Guardar fechas'}
      </button>
    </div>
  );
}
