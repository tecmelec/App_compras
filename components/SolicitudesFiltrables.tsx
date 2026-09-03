'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import EstadoBadge from '@/components/EstadoBadge';

export type PedidoFila = {
  id: string;
  numero_app: string;
  numero_tecmelec: string | null;
  solicitante: string;
  comprador?: string | null;
  total_estimado: number;
  requiere_aprobacion: boolean;
  aprobado: boolean | null;
  estado: string | null;
  created_at: string;
};

type Filtros = {
  numeroApp: string;
  numeroTecmelec: string;
  solicitantes: string[];
  compradores: string[];
  aprobaciones: string[];
  estados: string[];
  precioMin: string;
  precioMax: string;
  fechaDesde: string;
  fechaHasta: string;
};

const FILTROS_VACIOS: Filtros = {
  numeroApp: '',
  numeroTecmelec: '',
  solicitantes: [],
  compradores: [],
  aprobaciones: [],
  estados: [],
  precioMin: '',
  precioMax: '',
  fechaDesde: '',
  fechaHasta: '',
};

const OPCIONES_APROBACION = [
  { value: 'automatica', label: 'Automática' },
  { value: 'pendiente', label: 'Pendiente' },
  { value: 'aprobada', label: 'Aprobada' },
  { value: 'rechazada', label: 'Rechazada' },
];

function aprobacionDe(p: PedidoFila): 'automatica' | 'pendiente' | 'aprobada' | 'rechazada' {
  if (!p.requiere_aprobacion) return 'automatica';
  if (p.aprobado === null) return 'pendiente';
  return p.aprobado ? 'aprobada' : 'rechazada';
}

export default function SolicitudesFiltrables({
  pedidos,
  linkBase,
  mostrarComprador = false,
}: {
  pedidos: PedidoFila[];
  linkBase: string;
  mostrarComprador?: boolean;
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [columnaAbierta, setColumnaAbierta] = useState<string | null>(null);

  const solicitantesUnicos = useMemo(
    () => Array.from(new Set(pedidos.map((p) => p.solicitante))).sort(),
    [pedidos]
  );
  const compradoresUnicos = useMemo(
    () => Array.from(new Set(pedidos.map((p) => p.comprador).filter(Boolean))).sort() as string[],
    [pedidos]
  );
  const estadosUnicos = useMemo(
    () => Array.from(new Set(pedidos.map((p) => p.estado).filter(Boolean))).sort() as string[],
    [pedidos]
  );

  const hayFiltrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);

  const filtrados = pedidos.filter((p) => {
    if (filtros.numeroApp && !p.numero_app.toLowerCase().includes(filtros.numeroApp.toLowerCase())) return false;
    if (
      filtros.numeroTecmelec &&
      !(p.numero_tecmelec || '').toLowerCase().includes(filtros.numeroTecmelec.toLowerCase())
    )
      return false;
    if (filtros.solicitantes.length > 0 && !filtros.solicitantes.includes(p.solicitante)) return false;
    if (mostrarComprador && filtros.compradores.length > 0 && !filtros.compradores.includes(p.comprador || ''))
      return false;
    if (filtros.aprobaciones.length > 0 && !filtros.aprobaciones.includes(aprobacionDe(p))) return false;
    if (filtros.estados.length > 0 && !filtros.estados.includes(p.estado || '')) return false;
    if (filtros.precioMin && p.total_estimado < Number(filtros.precioMin)) return false;
    if (filtros.precioMax && p.total_estimado > Number(filtros.precioMax)) return false;
    if (filtros.fechaDesde && new Date(p.created_at) < new Date(filtros.fechaDesde)) return false;
    if (filtros.fechaHasta && new Date(p.created_at) > new Date(filtros.fechaHasta + 'T23:59:59')) return false;
    return true;
  });

  function actualizar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function alternarValorLista(campo: 'solicitantes' | 'compradores' | 'aprobaciones' | 'estados', valor: string) {
    setFiltros((prev) => {
      const lista = prev[campo];
      const nueva = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
      return { ...prev, [campo]: nueva };
    });
  }

  return (
    <div>
      {hayFiltrosActivos && (
        <button
          onClick={() => setFiltros(FILTROS_VACIOS)}
          className="text-sm text-acero hover:underline mb-3"
        >
          ✕ Borrar filtros
        </button>
      )}

      {columnaAbierta && (
        <div className="fixed inset-0 z-10" onClick={() => setColumnaAbierta(null)} />
      )}

      <div className="bg-white border border-borde rounded-lg overflow-visible">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <ColumnaFiltro
                titulo="Nº pedido APP"
                columnaId="numeroApp"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.numeroApp}
              >
                <input
                  className="input"
                  placeholder="Buscar..."
                  value={filtros.numeroApp}
                  onChange={(e) => actualizar('numeroApp', e.target.value)}
                  autoFocus
                />
              </ColumnaFiltro>

              <ColumnaFiltro
                titulo="Solicitante"
                columnaId="solicitante"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={filtros.solicitantes.length > 0}
              >
                <ListaChecks
                  opciones={solicitantesUnicos}
                  seleccionadas={filtros.solicitantes}
                  onToggle={(v) => alternarValorLista('solicitantes', v)}
                />
              </ColumnaFiltro>

              {mostrarComprador && (
                <ColumnaFiltro
                  titulo="Comprador"
                  columnaId="comprador"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activo={filtros.compradores.length > 0}
                >
                  <ListaChecks
                    opciones={compradoresUnicos}
                    seleccionadas={filtros.compradores}
                    onToggle={(v) => alternarValorLista('compradores', v)}
                  />
                </ColumnaFiltro>
              )}

              <ColumnaFiltro
                titulo="Nº pedido Tecmelec"
                columnaId="numeroTecmelec"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.numeroTecmelec}
              >
                <input
                  className="input"
                  placeholder="Buscar..."
                  value={filtros.numeroTecmelec}
                  onChange={(e) => actualizar('numeroTecmelec', e.target.value)}
                  autoFocus
                />
              </ColumnaFiltro>

              <ColumnaFiltro
                titulo="Precio"
                columnaId="precio"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.precioMin || !!filtros.precioMax}
              >
                <div className="flex flex-col gap-2">
                  <input
                    className="input"
                    type="number"
                    placeholder="Mínimo"
                    value={filtros.precioMin}
                    onChange={(e) => actualizar('precioMin', e.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="Máximo"
                    value={filtros.precioMax}
                    onChange={(e) => actualizar('precioMax', e.target.value)}
                  />
                </div>
              </ColumnaFiltro>

              <ColumnaFiltro
                titulo="Aprobación"
                columnaId="aprobacion"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={filtros.aprobaciones.length > 0}
              >
                <ListaChecks
                  opciones={OPCIONES_APROBACION.map((o) => o.value)}
                  etiquetas={Object.fromEntries(OPCIONES_APROBACION.map((o) => [o.value, o.label]))}
                  seleccionadas={filtros.aprobaciones}
                  onToggle={(v) => alternarValorLista('aprobaciones', v)}
                />
              </ColumnaFiltro>

              <ColumnaFiltro
                titulo="Estado"
                columnaId="estado"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={filtros.estados.length > 0}
              >
                <ListaChecks
                  opciones={estadosUnicos}
                  seleccionadas={filtros.estados}
                  onToggle={(v) => alternarValorLista('estados', v)}
                />
              </ColumnaFiltro>

              <ColumnaFiltro
                titulo="Fecha"
                columnaId="fecha"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.fechaDesde || !!filtros.fechaHasta}
              >
                <div className="flex flex-col gap-2">
                  <input
                    className="input"
                    type="date"
                    value={filtros.fechaDesde}
                    onChange={(e) => actualizar('fechaDesde', e.target.value)}
                  />
                  <input
                    className="input"
                    type="date"
                    value={filtros.fechaHasta}
                    onChange={(e) => actualizar('fechaHasta', e.target.value)}
                  />
                </div>
              </ColumnaFiltro>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate text-sm">
                  No hay solicitudes que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-fondo">
                  <td className="px-4 py-3">
                    <Link href={`${linkBase}/${p.id}`} className="font-mono text-acero">
                      {p.numero_app}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-grafito">{p.solicitante}</td>
                  {mostrarComprador && <td className="px-4 py-3 text-grafito">{p.comprador || '—'}</td>}
                  <td className="px-4 py-3 font-mono text-grafito">{p.numero_tecmelec || '—'}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{p.total_estimado?.toFixed(2)} €</td>
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
                    {new Date(p.created_at).toLocaleDateString('es-CL')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ColumnaFiltro({
  titulo,
  columnaId,
  columnaAbierta,
  setColumnaAbierta,
  activo,
  children,
}: {
  titulo: string;
  columnaId: string;
  columnaAbierta: string | null;
  setColumnaAbierta: (v: string | null) => void;
  activo: boolean;
  children: React.ReactNode;
}) {
  const abierta = columnaAbierta === columnaId;

  return (
    <th className="px-4 py-3 font-medium relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          setColumnaAbierta(abierta ? null : columnaId);
        }}
        className={`flex items-center gap-1 ${activo ? 'text-acero' : ''}`}
      >
        {titulo}
        <span className="text-xs">▾</span>
        {activo && <span className="w-1.5 h-1.5 rounded-full bg-acero" />}
      </button>

      {abierta && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20 top-full left-0 mt-1 bg-white border border-borde rounded-lg shadow-lg p-3 w-56 font-normal normal-case"
        >
          {children}
        </div>
      )}
    </th>
  );
}

function ListaChecks({
  opciones,
  etiquetas,
  seleccionadas,
  onToggle,
}: {
  opciones: string[];
  etiquetas?: Record<string, string>;
  seleccionadas: string[];
  onToggle: (valor: string) => void;
}) {
  if (opciones.length === 0) {
    return <p className="text-sm text-slate">Sin opciones.</p>;
  }

  return (
    <div className="max-h-48 overflow-y-auto space-y-1">
      {opciones.map((op) => (
        <label key={op} className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={seleccionadas.includes(op)}
            onChange={() => onToggle(op)}
          />
          {etiquetas?.[op] || op}
        </label>
      ))}
    </div>
  );
}
