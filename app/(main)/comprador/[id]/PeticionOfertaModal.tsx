'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ComboboxProveedor from '@/components/ComboboxProveedor';
import {
  datosProveedorOferta,
  enviarPeticionOferta,
  prepararPeticionesOferta,
  type ContextoPeticion,
} from '@/app/actions/peticion-oferta';
import type { LineaPeticion } from '@/lib/peticion-oferta';
import { formatoCantidad } from '@/lib/cantidad';

type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };

type Tarjeta = {
  proveedorId: string;
  proveedorNo: string;
  proveedorNombre: string;
  motivos: string[];
  sugerido: boolean;
  destinatarios: string;
  cc: string;
  itemIds: string[];
  asunto: string;
  cuerpo: string;
  cuerpoEditado: boolean;
  estado: 'pendiente' | 'enviando' | 'enviado' | 'error';
  mensaje?: string;
};

function generarCuerpo(lineas: LineaPeticion[], itemIds: string[], ctx: ContextoPeticion) {
  const filas = lineas
    .filter((l) => itemIds.includes(l.itemId))
    .map((l) => `- ${l.bcItemNo ? l.bcItemNo + ' · ' : ''}${l.articulo} — ${formatoCantidad(l.cantidad)} ${l.unidad}`)
    .join('\n');
  const datos = [
    ctx.proyecto && `Obra: ${ctx.proyecto}`,
    ctx.direccion && `Lugar de entrega: ${ctx.direccion}`,
    ctx.fechaRequerida && `Fecha requerida: ${new Date(ctx.fechaRequerida + 'T00:00:00').toLocaleDateString('es-ES')}`,
  ]
    .filter(Boolean)
    .join('\n');
  return `Buenos días,

Les solicitamos su mejor oferta para el siguiente material:

${filas}

${datos ? datos + '\n\n' : ''}Por favor, indiquen precio neto unitario (con descuentos), plazo de entrega y si incluye portes. Rogamos que en su respuesta hagan referencia a ${ctx.numeroApp}.

Un saludo,
${ctx.firma ? ctx.firma + '\n' : ''}Tecmelec Electricidad S.L.`;
}

export default function PeticionOfertaModal({
  pedidoId,
  propuestaId,
  lineasPanel,
  preseleccion,
  proveedores,
  onCerrar,
}: {
  pedidoId: string;
  propuestaId: string | null;
  lineasPanel: { itemId: string; articulo: string; bcItemNo: string | null; cantidad: number; unidad: string; pedirOferta: boolean }[];
  preseleccion: string[];
  proveedores: Proveedor[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<'lineas' | 'preparando' | 'tarjetas'>('lineas');
  const [seleccion, setSeleccion] = useState<string[]>(preseleccion);
  const [lineas, setLineas] = useState<LineaPeticion[]>([]);
  const [contexto, setContexto] = useState<ContextoPeticion | null>(null);
  const [tarjetas, setTarjetas] = useState<Tarjeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nuevoProv, setNuevoProv] = useState('');
  const [anadiendo, setAnadiendo] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => e.key === 'Escape' && !enviando && onCerrar();
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [enviando, onCerrar]);

  async function preparar() {
    setFase('preparando');
    setError(null);
    const r = await prepararPeticionesOferta(pedidoId, seleccion);
    if ('error' in r && r.error) {
      setError(r.error);
      setFase('lineas');
      return;
    }
    const d = r as { lineas: LineaPeticion[]; grupos: any[]; contexto: ContextoPeticion };
    setLineas(d.lineas);
    setContexto(d.contexto);
    setTarjetas(
      d.grupos.map((g) => ({
        proveedorId: g.proveedorId,
        proveedorNo: g.proveedorNo,
        proveedorNombre: g.proveedorNombre,
        motivos: g.motivos,
        sugerido: true,
        destinatarios: (g.emails || []).join(', '),
        cc: '',
        itemIds: g.itemIds,
        asunto: `Petición de oferta ${d.contexto.numeroApp} · ${g.proveedorNo} · Tecmelec`,
        cuerpo: generarCuerpo(d.lineas, g.itemIds, d.contexto),
        cuerpoEditado: false,
        estado: 'pendiente',
      }))
    );
    setFase('tarjetas');
  }

  function cambiarTarjeta(k: number, cambios: Partial<Tarjeta>) {
    setTarjetas((prev) =>
      prev.map((t, i) => {
        if (i !== k) return t;
        const n = { ...t, ...cambios };
        // Si cambian los artículos y el mensaje no se ha editado a mano, se regenera.
        if (cambios.itemIds && !n.cuerpoEditado && contexto) n.cuerpo = generarCuerpo(lineas, n.itemIds, contexto);
        return n;
      })
    );
  }

  async function anadirProveedor() {
    if (!nuevoProv || tarjetas.some((t) => t.proveedorId === nuevoProv)) return;
    setAnadiendo(true);
    const r = await datosProveedorOferta(nuevoProv);
    setAnadiendo(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    const p = r as { proveedorId: string; proveedorNo: string; proveedorNombre: string; emails: string[] };
    const ids = lineas.map((l) => l.itemId);
    setTarjetas((prev) => [
      ...prev,
      {
        proveedorId: p.proveedorId,
        proveedorNo: p.proveedorNo,
        proveedorNombre: p.proveedorNombre,
        motivos: ['Añadido por el comprador'],
        sugerido: false,
        destinatarios: p.emails.join(', '),
        cc: '',
        itemIds: ids,
        asunto: `Petición de oferta ${contexto?.numeroApp || ''} · ${p.proveedorNo} · Tecmelec`,
        cuerpo: contexto ? generarCuerpo(lineas, ids, contexto) : '',
        cuerpoEditado: false,
        estado: 'pendiente',
      },
    ]);
    setNuevoProv('');
  }

  async function enviarTodas() {
    setEnviando(true);
    setError(null);
    for (let k = 0; k < tarjetas.length; k++) {
      const t = tarjetas[k];
      if (t.estado === 'enviado') continue;
      cambiarTarjeta(k, { estado: 'enviando', mensaje: undefined });
      const r = await enviarPeticionOferta({
        pedidoId,
        propuestaId,
        proveedorId: t.proveedorId,
        proveedorNombre: `${t.proveedorNo} - ${t.proveedorNombre}`,
        destinatarios: t.destinatarios.split(/[;,]/),
        cc: t.cc.split(/[;,]/),
        asunto: t.asunto,
        cuerpo: t.cuerpo,
        itemIds: t.itemIds,
        sugerido: t.sugerido,
      });
      if ('error' in r && r.error) cambiarTarjeta(k, { estado: 'error', mensaje: r.error });
      else cambiarTarjeta(k, { estado: 'enviado', mensaje: ('aviso' in r && (r as any).aviso) || undefined });
    }
    setEnviando(false);
    router.refresh();
  }

  const sinProveedor = lineas.filter((l) => !tarjetas.some((t) => t.itemIds.includes(l.itemId)));
  const pendientes = tarjetas.filter((t) => t.estado !== 'enviado');
  const tarjetaInvalida = (t: Tarjeta) => !t.destinatarios.trim() || t.itemIds.length === 0 || !t.asunto.trim() || !t.cuerpo.trim();

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-start justify-center p-4 overflow-y-auto" onClick={() => !enviando && onCerrar()}>
      <div className="bg-white rounded-xl w-full max-w-4xl my-6 p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="text-lg font-semibold text-grafito">Pedir ofertas</h2>
            <p className="text-xs text-slate">
              Se envía un email por proveedor desde tu buzón, solo con sus artículos. Revisa destinatarios y mensaje antes de enviar.
            </p>
          </div>
          <button onClick={onCerrar} disabled={enviando} className="text-slate hover:text-grafito text-xl leading-none px-2" aria-label="Cerrar">
            ×
          </button>
        </div>
        {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-3">{error}</p>}

        {(fase === 'lineas' || fase === 'preparando') && (
          <>
            <p className="text-sm font-medium text-grafito mb-2">¿De qué artículos quieres pedir oferta?</p>
            <ul className="border border-borde rounded-md divide-y divide-borde mb-4">
              {lineasPanel.map((l) => (
                <li key={l.itemId} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <input
                    type="checkbox"
                    checked={seleccion.includes(l.itemId)}
                    onChange={(e) =>
                      setSeleccion((prev) => (e.target.checked ? [...prev, l.itemId] : prev.filter((x) => x !== l.itemId)))
                    }
                  />
                  <span className="flex-1">
                    {l.articulo}{' '}
                    <span className="text-xs text-slate">
                      · {formatoCantidad(l.cantidad)} {l.unidad}
                    </span>
                  </span>
                  {l.pedirOferta && <span className="text-xs rounded px-1.5 py-0.5 bg-[#DBEAFE] text-[#1D4ED8]">Sin datos</span>}
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2">
              <button onClick={onCerrar} className="btn-secondary">
                Cancelar
              </button>
              <button onClick={preparar} disabled={seleccion.length === 0 || fase === 'preparando'} className="btn-primary disabled:opacity-60">
                {fase === 'preparando' ? 'Buscando proveedores…' : `Preparar peticiones (${seleccion.length})`}
              </button>
            </div>
          </>
        )}

        {fase === 'tarjetas' && (
          <>
            {sinProveedor.length > 0 && (
              <p className="text-xs text-[#92400E] bg-[#FEF3C7] rounded-md px-3 py-2 mb-3">
                Sin proveedor sugerido: {sinProveedor.map((l) => l.articulo).join(', ')}. Añade un proveedor abajo para pedirles oferta.
              </p>
            )}
            <div className="space-y-3">
              {tarjetas.map((t, k) => (
                <div
                  key={t.proveedorId}
                  className={`border rounded-lg p-3 ${t.estado === 'enviado' ? 'border-[#A7E3C4] bg-[#F3FBF6]' : t.estado === 'error' ? 'border-[#E7C7C7]' : 'border-borde'}`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <p className="text-sm font-semibold text-grafito">
                        {t.proveedorNo} — {t.proveedorNombre}
                      </p>
                      <p className="text-xs text-slate">{t.motivos.join(' · ')}</p>
                    </div>
                    {t.estado === 'enviado' ? (
                      <span className="text-xs font-medium text-[#047857]">Enviado ✓</span>
                    ) : t.estado === 'enviando' ? (
                      <span className="text-xs text-slate">Enviando…</span>
                    ) : (
                      <button
                        onClick={() => setTarjetas((prev) => prev.filter((_, i) => i !== k))}
                        disabled={enviando}
                        className="text-xs text-rojo hover:underline"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                  {t.mensaje && <p className={`text-xs mb-2 ${t.estado === 'error' ? 'text-rojo' : 'text-slate'}`}>{t.mensaje}</p>}
                  {t.estado !== 'enviado' && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <label className="text-xs text-slate">
                        Para (separa con comas)
                        <input
                          className="input w-full text-sm mt-0.5"
                          value={t.destinatarios}
                          onChange={(e) => cambiarTarjeta(k, { destinatarios: e.target.value })}
                          placeholder="email@proveedor.com"
                        />
                      </label>
                      <label className="text-xs text-slate">
                        CC
                        <input className="input w-full text-sm mt-0.5" value={t.cc} onChange={(e) => cambiarTarjeta(k, { cc: e.target.value })} />
                      </label>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate mb-1">Artículos para este proveedor</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {lineas.map((l) => (
                            <label key={l.itemId} className="text-xs text-grafito inline-flex items-center gap-1">
                              <input
                                type="checkbox"
                                checked={t.itemIds.includes(l.itemId)}
                                onChange={(e) =>
                                  cambiarTarjeta(k, {
                                    itemIds: e.target.checked ? [...t.itemIds, l.itemId] : t.itemIds.filter((x) => x !== l.itemId),
                                  })
                                }
                              />
                              {l.articulo}
                            </label>
                          ))}
                        </div>
                      </div>
                      <label className="text-xs text-slate sm:col-span-2">
                        Asunto
                        <input className="input w-full text-sm mt-0.5" value={t.asunto} onChange={(e) => cambiarTarjeta(k, { asunto: e.target.value })} />
                      </label>
                      <label className="text-xs text-slate sm:col-span-2">
                        Mensaje
                        <textarea
                          className="input w-full text-sm mt-0.5 font-sans"
                          rows={10}
                          value={t.cuerpo}
                          onChange={(e) => cambiarTarjeta(k, { cuerpo: e.target.value, cuerpoEditado: true })}
                        />
                      </label>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mt-3 border-t border-borde pt-3">
              <span className="text-sm text-grafito">Añadir otro proveedor:</span>
              <ComboboxProveedor proveedores={proveedores} value={nuevoProv} onChange={setNuevoProv} className="w-80" />
              <button onClick={anadirProveedor} disabled={!nuevoProv || anadiendo || enviando} className="btn-secondary disabled:opacity-60">
                {anadiendo ? 'Añadiendo…' : 'Añadir'}
              </button>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <button onClick={onCerrar} disabled={enviando} className="btn-secondary">
                {pendientes.length === 0 ? 'Cerrar' : 'Cancelar'}
              </button>
              {pendientes.length > 0 && (
                <button
                  onClick={enviarTodas}
                  disabled={enviando || pendientes.some(tarjetaInvalida)}
                  className="btn-primary disabled:opacity-60"
                  title={pendientes.some(tarjetaInvalida) ? 'Revisa que cada proveedor tenga destinatario, artículos, asunto y mensaje' : undefined}
                >
                  {enviando ? 'Enviando…' : `Enviar ${pendientes.length} email${pendientes.length === 1 ? '' : 's'}`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
