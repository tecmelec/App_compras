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

export default function SolicitudesFiltrables({
  pedidos,
  linkBase,
  mostrarComprador = false,
}: {
  pedidos: PedidoFila[];
  linkBase: string;
  mostrarComprador?: boolean;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [aprobacion, setAprobacion] = useState('todas');
  const [estado, setEstado] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [precioMin, setPrecioMin] = useState('');
  const [precioMax, setPrecioMax] = useState('');

  const estadosDisponibles = useMemo(
    () => Array.from(new Set(pedidos.map((p) => p.estado).filter(Boolean))) as string[],
    [pedidos]
  );

  function aprobacionDe(p: PedidoFila): 'automatica' | 'pendiente' | 'aprobada' | 'rechazada' {
    if (!p.requiere_aprobacion) return 'automatica';
    if (p.aprobado === null) return 'pendiente';
    return p.aprobado ? 'aprobada' : 'rechazada';
  }

  const filtrados = pedidos.filter((p) => {
    if (busqueda) {
      const texto = busqueda.toLowerCase();
      const coincide =
        p.numero_app.toLowerCase().includes(texto) ||
        p.solicitante.toLowerCase().includes(texto) ||
        (p.numero_tecmelec || '').toLowerCase().includes(texto);
      if (!coincide) return false;
    }
    if (aprobacion !== 'todas' && aprobacionDe(p) !== aprobacion) return false;
    if (estado !== 'todos' && p.estado !== estado) return false;
    if (precioMin && p.total_estimado < Number(precioMin)) return false;
    if (precioMax && p.total_estimado > Number(precioMax)) return false;
    if (fechaDesde && new Date(p.created_at) < new Date(fechaDesde)) return false;
    if (fechaHasta && new Date(p.created_at) > new Date(fechaHasta + 'T23:59:59')) return false;
    return true;
  });

  return (
    <div>
      <div className="bg-white border border-borde rounded-lg p-4 mb-4 grid grid-cols-2 md:grid-cols-4 gap-3">
        <input
          className="input"
          placeholder="Buscar por Nº pedido o solicitante"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <select className="input" value={aprobacion} onChange={(e) => setAprobacion(e.target.value)}>
          <option value="todas">Aprobación: todas</option>
          <option value="automatica">Automática</option>
          <option value="pendiente">Pendiente</option>
          <option value="aprobada">Aprobada</option>
          <option value="rechazada">Rechazada</option>
        </select>
        <select className="input" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="todos">Estado: todos</option>
          {estadosDisponibles.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          <input
            className="input"
            type="number"
            placeholder="Precio mín."
            value={precioMin}
            onChange={(e) => setPrecioMin(e.target.value)}
          />
          <input
            className="input"
            type="number"
            placeholder="Precio máx."
            value={precioMax}
            onChange={(e) => setPrecioMax(e.target.value)}
          />
        </div>
        <div className="flex gap-2 col-span-2">
          <input
            className="input"
            type="date"
            value={fechaDesde}
            onChange={(e) => setFechaDesde(e.target.value)}
          />
          <input
            className="input"
            type="date"
            value={fechaHasta}
            onChange={(e) => setFechaHasta(e.target.value)}
          />
        </div>
      </div>

      {filtrados.length === 0 ? (
        <p className="text-slate text-sm">No hay solicitudes que coincidan con los filtros.</p>
      ) : (
        <div className="bg-white border border-borde rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-fondo text-slate text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Nº pedido APP</th>
                <th className="px-4 py-3 font-medium">Solicitante</th>
                {mostrarComprador && <th className="px-4 py-3 font-medium">Comprador</th>}
                <th className="px-4 py-3 font-medium">Nº pedido Tecmelec</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Aprobación</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {filtrados.map((p) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
