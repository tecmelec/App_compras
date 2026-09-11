'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import ColumnaFiltroOrden from '@/components/ColumnaFiltroOrden';

export type LineaFila = {
  numero_app: string;
  pedido_href: string;
  numero_tecmelec: string | null;
  articulo: string;
  cantidad: number;
  fecha_requerida: string | null;
  fecha_estimada_entrega: string | null;
};

type Filtros = {
  busqueda: string;
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
  busqueda: '',
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

  function ordenarPor(campo: CampoOrden, asc: boolean) {
    setOrden({ campo, asc });
  }

  const filtradas = filas.filter((f) => {
    if (filtros.busqueda) {
      const palabras = filtros.busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const texto = `${f.numero_app} ${f.numero_tecmelec || ''} ${f.articulo}`.toLowerCase();
      const coincide = palabras.every((palabra) => texto.includes(palabra));
      if (!coincide) return false;
    }
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
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative w-full max-w-md">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            className="input input-icon-left w-full"
            placeholder="Buscar por Nº pedido APP, Nº pedido Tecmelec o artículo..."
            value={filtros.busqueda}
            onChange={(e) => actualizar('busqueda', e.target.value)}
          />
        </div>

        {hayFiltrosActivos && (
          <button onClick={() => setFiltros(FILTROS_VACIOS)} className="text-sm text-marca hover:underline">
            ✕ Borrar filtros
          </button>
        )}
      </div>

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
                onLimpiarFiltro={() => actualizar('numeroApp', '')}
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
                onLimpiarFiltro={() => actualizar('numeroTecmelec', '')}
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
                titulo="Artículo solicitado"
                campoOrden="articulo"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="articulo"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={filtros.articulos.length > 0}
                onLimpiarFiltro={() => actualizar('articulos', [])}
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
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Cantidad"
                campoOrden="cantidad"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="cantidad"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.cantidadMin || !!filtros.cantidadMax}
                onLimpiarFiltro={() => { actualizar('cantidadMin', ''); actualizar('cantidadMax', ''); }}
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
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Fecha requerida"
                campoOrden="fecha_requerida"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="requerida"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.requeridaDesde || !!filtros.requeridaHasta}
                onLimpiarFiltro={() => { actualizar('requeridaDesde', ''); actualizar('requeridaHasta', ''); }}
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

              <ColumnaFiltroOrden
                titulo="Fecha estimada de entrega"
                campoOrden="fecha_estimada_entrega"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="entrega"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.entregaDesde || !!filtros.entregaHasta}
                onLimpiarFiltro={() => { actualizar('entregaDesde', ''); actualizar('entregaHasta', ''); }}
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
              </ColumnaFiltroOrden>
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
                  <td className="px-4 py-3 font-mono text-marca">
                    <Link href={f.pedido_href} className="hover:underline underline-offset-2">
                      {f.numero_app}
                    </Link>
                  </td>
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
    </div>
  );
}

