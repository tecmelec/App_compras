'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import EstadoBadge from '@/components/EstadoBadge';
import ColumnaFiltroOrden from '@/components/ColumnaFiltroOrden';
import ObraCelda from '@/components/ObraCelda';

export type MiPedidoFila = {
  id: string;
  numero_app: string;
  numero_tecmelec: string;
  nro_obra: string;
  nombre_obra?: string;
  requiere_aprobacion: boolean;
  aprobado: boolean | null;
  estado: string | null;
  fecha_solicitud: string;
  fecha_requerida: string | null;
};

type Filtros = {
  numeroApp: string;
  numeroTecmelec: string;
  nroObra: string;
  aprobaciones: string[];
  estados: string[];
  solicitudDesde: string;
  solicitudHasta: string;
  requeridaDesde: string;
  requeridaHasta: string;
};

const FILTROS_VACIOS: Filtros = {
  numeroApp: '',
  numeroTecmelec: '',
  nroObra: '',
  aprobaciones: [],
  estados: [],
  solicitudDesde: '',
  solicitudHasta: '',
  requeridaDesde: '',
  requeridaHasta: '',
};

const OPCIONES_APROBACION = [
  { value: 'automatica', label: 'Automática' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
];

type CampoOrden = 'numero_app' | 'numero_tecmelec' | 'nro_obra' | 'aprobacion' | 'estado' | 'fecha_solicitud' | 'fecha_requerida';

function aprobacionDe(p: MiPedidoFila): 'automatica' | 'pendiente' | 'aprobada' | 'rechazada' {
  if (!p.requiere_aprobacion) return 'automatica';
  if (p.aprobado === null) return 'pendiente';
  return p.aprobado ? 'aprobada' : 'rechazada';
}

export default function MisPedidosClient({ pedidos }: { pedidos: MiPedidoFila[] }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [columnaAbierta, setColumnaAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ campo: CampoOrden; asc: boolean } | null>(null);

  const estadosUnicos = useMemo(
    () => Array.from(new Set(pedidos.map((p) => p.estado).filter(Boolean))).sort() as string[],
    [pedidos]
  );

  const hayFiltrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);

  function actualizar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function alternarLista(campo: 'aprobaciones' | 'estados', valor: string) {
    setFiltros((prev) => {
      const lista = prev[campo];
      const nueva = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
      return { ...prev, [campo]: nueva };
    });
  }

  function ordenarPor(campo: CampoOrden, asc: boolean) {
    setOrden({ campo, asc });
  }

  const filtrados = pedidos.filter((p) => {
    if (filtros.numeroApp && !p.numero_app.toLowerCase().includes(filtros.numeroApp.toLowerCase())) return false;
    if (filtros.numeroTecmelec && !p.numero_tecmelec.toLowerCase().includes(filtros.numeroTecmelec.toLowerCase()))
      return false;
    if (filtros.nroObra && !p.nro_obra.toLowerCase().includes(filtros.nroObra.toLowerCase())) return false;
    if (filtros.aprobaciones.length > 0 && !filtros.aprobaciones.includes(aprobacionDe(p))) return false;
    if (filtros.estados.length > 0 && !filtros.estados.includes(p.estado || '')) return false;
    if (filtros.solicitudDesde && new Date(p.fecha_solicitud) < new Date(filtros.solicitudDesde)) return false;
    if (filtros.solicitudHasta && new Date(p.fecha_solicitud) > new Date(filtros.solicitudHasta + 'T23:59:59'))
      return false;
    if (filtros.requeridaDesde && (!p.fecha_requerida || new Date(p.fecha_requerida) < new Date(filtros.requeridaDesde)))
      return false;
    if (filtros.requeridaHasta && (!p.fecha_requerida || new Date(p.fecha_requerida) > new Date(filtros.requeridaHasta)))
      return false;
    return true;
  });

  const ordenados = useMemo(() => {
    if (!orden) return filtrados;
    const copia = [...filtrados];
    copia.sort((a, b) => {
      let va: any;
      let vb: any;
      if (orden.campo === 'aprobacion') {
        va = aprobacionDe(a);
        vb = aprobacionDe(b);
      } else {
        va = (a as any)[orden.campo] || '';
        vb = (b as any)[orden.campo] || '';
      }
      if (va < vb) return orden.asc ? -1 : 1;
      if (va > vb) return orden.asc ? 1 : -1;
      return 0;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, orden]);

  return (
    <div>
      {hayFiltrosActivos && (
        <button onClick={() => setFiltros(FILTROS_VACIOS)} className="text-sm text-marca hover:underline mb-3">
          ✕ Borrar filtros
        </button>
      )}

      {columnaAbierta && <div className="fixed inset-0 z-10" onClick={() => setColumnaAbierta(null)} />}

      <div className="bg-white border border-borde rounded-lg overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <ColumnaFiltroOrden
                  titulo="Nº pedido APP"
                  campoOrden="numero_app"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="numeroApp"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.numeroApp}
                >
                  <input
                    className="input"
                    placeholder="Buscar..."
                    value={filtros.numeroApp}
                    onChange={(e) => actualizar('numeroApp', e.target.value)}
                    autoFocus
                  />
                </ColumnaFiltroOrden>

                <ColumnaFiltroOrden
                  titulo="Nº pedido Tecmelec"
                  campoOrden="numero_tecmelec"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="numeroTecmelec"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.numeroTecmelec}
                >
                  <input
                    className="input"
                    placeholder="Buscar..."
                    value={filtros.numeroTecmelec}
                    onChange={(e) => actualizar('numeroTecmelec', e.target.value)}
                    autoFocus
                  />
                </ColumnaFiltroOrden>

                <ColumnaFiltroOrden
                  titulo="Nro. de obra"
                  campoOrden="nro_obra"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="nroObra"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.nroObra}
                >
                  <input
                    className="input"
                    placeholder="Buscar..."
                    value={filtros.nroObra}
                    onChange={(e) => actualizar('nroObra', e.target.value)}
                    autoFocus
                  />
                </ColumnaFiltroOrden>

                <ColumnaFiltroOrden
                  titulo="Aprobación"
                  campoOrden="aprobacion"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="aprobacion"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={filtros.aprobaciones.length > 0}
                >
                  <div className="space-y-1">
                    {OPCIONES_APROBACION.map((o) => (
                      <label key={o.value} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filtros.aprobaciones.includes(o.value)}
                          onChange={() => alternarLista('aprobaciones', o.value)}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </ColumnaFiltroOrden>

                <ColumnaFiltroOrden
                  titulo="Estado"
                  campoOrden="estado"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="estado"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={filtros.estados.length > 0}
                >
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {estadosUnicos.length === 0 ? (
                      <p className="text-sm text-slate">Sin opciones.</p>
                    ) : (
                      estadosUnicos.map((e) => (
                        <label key={e} className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="checkbox"
                            checked={filtros.estados.includes(e)}
                            onChange={() => alternarLista('estados', e)}
                          />
                          {e}
                        </label>
                      ))
                    )}
                  </div>
                </ColumnaFiltroOrden>

                <ColumnaFiltroOrden
                  titulo="Fecha de solicitud"
                  campoOrden="fecha_solicitud"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="fechaSolicitud"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.solicitudDesde || !!filtros.solicitudHasta}
                >
                  <div className="flex flex-col gap-2">
                    <input
                      className="input"
                      type="date"
                      value={filtros.solicitudDesde}
                      onChange={(e) => actualizar('solicitudDesde', e.target.value)}
                    />
                    <input
                      className="input"
                      type="date"
                      value={filtros.solicitudHasta}
                      onChange={(e) => actualizar('solicitudHasta', e.target.value)}
                    />
                  </div>
                </ColumnaFiltroOrden>

                <ColumnaFiltroOrden
                  titulo="Fecha requerida"
                  campoOrden="fecha_requerida"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="fechaRequerida"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.requeridaDesde || !!filtros.requeridaHasta}
                >
                  <div className="flex flex-col gap-2">
                    <input
                      className="input"
                      type="date"
                      value={filtros.requeridaDesde}
                      onChange={(e) => actualizar('requeridaDesde', e.target.value)}
                    />
                    <input
                      className="input"
                      type="date"
                      value={filtros.requeridaHasta}
                      onChange={(e) => actualizar('requeridaHasta', e.target.value)}
                    />
                  </div>
                </ColumnaFiltroOrden>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {ordenados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-slate text-sm">
                    No hay pedidos que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                ordenados.map((p) => (
                  <tr key={p.id} className="hover:bg-fondo">
                    <td className="px-4 py-3">
                      <Link href={`/mis-pedidos/${p.id}`} className="font-mono text-marca">
                        {p.numero_app}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-mono text-grafito">{p.numero_tecmelec || '—'}</td>
                    <td className="px-4 py-3 font-mono text-grafito">
                      <ObraCelda numero={p.nro_obra} nombre={p.nombre_obra} />
                    </td>
                    <td className="px-4 py-3">
                      {aprobacionDe(p) === 'automatica' && <span className="badge badge-entregado">Automática</span>}
                      {aprobacionDe(p) === 'pendiente' && <span className="badge badge-pendiente">Pendiente</span>}
                      {aprobacionDe(p) === 'aprobada' && <span className="badge badge-entregado">Aprobada</span>}
                      {aprobacionDe(p) === 'rechazada' && <span className="badge badge-cancelado">Rechazada</span>}
                    </td>
                    <td className="px-4 py-3">
                      <EstadoBadge estado={p.estado || undefined} />
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {new Date(p.fecha_solicitud).toLocaleDateString('es-CL')}
                    </td>
                    <td className="px-4 py-3 text-slate">
                      {p.fecha_requerida
                        ? new Date(p.fecha_requerida + 'T00:00:00').toLocaleDateString('es-CL')
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

