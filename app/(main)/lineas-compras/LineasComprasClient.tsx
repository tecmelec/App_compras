'use client';

import { useMemo, useState } from 'react';

export type LineaFila = {
  numero_app: string;
  numero_tecmelec: string | null;
  articulo: string;
  cantidad: number;
  fecha_requerida: string | null;
  fecha_estimada_entrega: string | null;
};

type Filtros = {
  numeroApp: string;
  numeroTecmelec: string;
  articulos: string[];
  cantidadMin: string;
  cantidadMax: string;
  requeridaDesde: string;
  requeridaHasta: string;
  entregaDesde: string;
  entregaHasta: string;
};

const FILTROS_VACIOS: Filtros = {
  numeroApp: '',
  numeroTecmelec: '',
  articulos: [],
  cantidadMin: '',
  cantidadMax: '',
  requeridaDesde: '',
  requeridaHasta: '',
  entregaDesde: '',
  entregaHasta: '',
};

type CampoOrden = 'numero_app' | 'numero_tecmelec' | 'articulo' | 'cantidad' | 'fecha_requerida' | 'fecha_estimada_entrega';

export default function LineasComprasClient({ filas }: { filas: LineaFila[] }) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [columnaAbierta, setColumnaAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ campo: CampoOrden; asc: boolean } | null>(null);

  const articulosUnicos = useMemo(
    () => Array.from(new Set(filas.map((f) => f.articulo))).sort(),
    [filas]
  );

  const hayFiltrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);

  function actualizar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function alternarArticulo(valor: string) {
    setFiltros((prev) => ({
      ...prev,
      articulos: prev.articulos.includes(valor)
        ? prev.articulos.filter((v) => v !== valor)
        : [...prev.articulos, valor],
    }));
  }

  function alternarOrden(campo: CampoOrden) {
    setOrden((prev) => (prev?.campo === campo ? { campo, asc: !prev.asc } : { campo, asc: true }));
  }

  const filtradas = filas.filter((f) => {
    if (filtros.numeroApp && !f.numero_app.toLowerCase().includes(filtros.numeroApp.toLowerCase())) return false;
    if (
      filtros.numeroTecmelec &&
      !(f.numero_tecmelec || '').toLowerCase().includes(filtros.numeroTecmelec.toLowerCase())
    )
      return false;
    if (filtros.articulos.length > 0 && !filtros.articulos.includes(f.articulo)) return false;
    if (filtros.cantidadMin && f.cantidad < Number(filtros.cantidadMin)) return false;
    if (filtros.cantidadMax && f.cantidad > Number(filtros.cantidadMax)) return false;
    if (filtros.requeridaDesde && (!f.fecha_requerida || new Date(f.fecha_requerida) < new Date(filtros.requeridaDesde)))
      return false;
    if (filtros.requeridaHasta && (!f.fecha_requerida || new Date(f.fecha_requerida) > new Date(filtros.requeridaHasta)))
      return false;
    if (
      filtros.entregaDesde &&
      (!f.fecha_estimada_entrega || new Date(f.fecha_estimada_entrega) < new Date(filtros.entregaDesde))
    )
      return false;
    if (
      filtros.entregaHasta &&
      (!f.fecha_estimada_entrega || new Date(f.fecha_estimada_entrega) > new Date(filtros.entregaHasta))
    )
      return false;
    return true;
  });

  const ordenadas = useMemo(() => {
    if (!orden) return filtradas;
    const copia = [...filtradas];
    copia.sort((a, b) => {
      let va: any = a[orden.campo];
      let vb: any = b[orden.campo];
      if (orden.campo === 'cantidad') {
        va = va ?? 0;
        vb = vb ?? 0;
      } else {
        va = va || '';
        vb = vb || '';
      }
      if (va < vb) return orden.asc ? -1 : 1;
      if (va > vb) return orden.asc ? 1 : -1;
      return 0;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtradas, orden]);

  return (
    <div>
      {hayFiltrosActivos && (
        <button onClick={() => setFiltros(FILTROS_VACIOS)} className="text-sm text-acero hover:underline mb-3">
          ✕ Borrar filtros
        </button>
      )}

      {columnaAbierta && <div className="fixed inset-0 z-10" onClick={() => setColumnaAbierta(null)} />}

      <div className="bg-white border border-borde rounded-lg overflow-visible">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <Columna
                titulo="Nº pedido APP"
                campoOrden="numero_app"
                orden={orden}
                onOrdenar={alternarOrden}
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
              </Columna>

              <Columna
                titulo="Nº pedido Tecmelec"
                campoOrden="numero_tecmelec"
                orden={orden}
                onOrdenar={alternarOrden}
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
              </Columna>

              <Columna
                titulo="Artículo solicitado"
                campoOrden="articulo"
                orden={orden}
                onOrdenar={alternarOrden}
                columnaId="articulo"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={filtros.articulos.length > 0}
              >
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {articulosUnicos.map((a) => (
                    <label key={a} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filtros.articulos.includes(a)}
                        onChange={() => alternarArticulo(a)}
                      />
                      {a}
                    </label>
                  ))}
                </div>
              </Columna>

              <Columna
                titulo="Cantidad"
                campoOrden="cantidad"
                orden={orden}
                onOrdenar={alternarOrden}
                columnaId="cantidad"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.cantidadMin || !!filtros.cantidadMax}
              >
                <div className="flex flex-col gap-2">
                  <input
                    className="input"
                    type="number"
                    placeholder="Mínima"
                    value={filtros.cantidadMin}
                    onChange={(e) => actualizar('cantidadMin', e.target.value)}
                  />
                  <input
                    className="input"
                    type="number"
                    placeholder="Máxima"
                    value={filtros.cantidadMax}
                    onChange={(e) => actualizar('cantidadMax', e.target.value)}
                  />
                </div>
              </Columna>

              <Columna
                titulo="Fecha requerida"
                campoOrden="fecha_requerida"
                orden={orden}
                onOrdenar={alternarOrden}
                columnaId="requerida"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.requeridaDesde || !!filtros.requeridaHasta}
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
              </Columna>

              <Columna
                titulo="Fecha estimada de entrega"
                campoOrden="fecha_estimada_entrega"
                orden={orden}
                onOrdenar={alternarOrden}
                columnaId="entrega"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.entregaDesde || !!filtros.entregaHasta}
              >
                <div className="flex flex-col gap-2">
                  <input
                    className="input"
                    type="date"
                    value={filtros.entregaDesde}
                    onChange={(e) => actualizar('entregaDesde', e.target.value)}
                  />
                  <input
                    className="input"
                    type="date"
                    value={filtros.entregaHasta}
                    onChange={(e) => actualizar('entregaHasta', e.target.value)}
                  />
                </div>
              </Columna>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {ordenadas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate text-sm">
                  No hay líneas que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              ordenadas.map((f, idx) => (
                <tr key={idx} className="hover:bg-fondo">
                  <td className="px-4 py-3 font-mono text-acero">{f.numero_app}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{f.numero_tecmelec || '—'}</td>
                  <td className="px-4 py-3 text-grafito">{f.articulo}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{f.cantidad}</td>
                  <td className="px-4 py-3 text-slate">
                    {f.fecha_requerida
                      ? new Date(f.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {f.fecha_estimada_entrega
                      ? new Date(f.fecha_estimada_entrega).toLocaleDateString('es-ES')
                      : 'Por definir'}
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

function Columna({
  titulo,
  campoOrden,
  orden,
  onOrdenar,
  columnaId,
  columnaAbierta,
  setColumnaAbierta,
  activo,
  children,
}: {
  titulo: string;
  campoOrden: CampoOrden;
  orden: { campo: CampoOrden; asc: boolean } | null;
  onOrdenar: (campo: CampoOrden) => void;
  columnaId: string;
  columnaAbierta: string | null;
  setColumnaAbierta: (v: string | null) => void;
  activo: boolean;
  children: React.ReactNode;
}) {
  const abierta = columnaAbierta === columnaId;
  const ordenActivo = orden?.campo === campoOrden;

  return (
    <th className="px-4 py-3 font-medium relative whitespace-nowrap">
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => onOrdenar(campoOrden)}
          className={`hover:underline ${ordenActivo ? 'text-acero' : ''}`}
        >
          {titulo}
          {ordenActivo && <span className="ml-1">{orden!.asc ? '↑' : '↓'}</span>}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setColumnaAbierta(abierta ? null : columnaId);
          }}
          className={activo ? 'text-acero' : ''}
        >
          <span className="text-xs">▾</span>
          {activo && <span className="w-1.5 h-1.5 rounded-full bg-acero inline-block ml-0.5" />}
        </button>
      </span>

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
