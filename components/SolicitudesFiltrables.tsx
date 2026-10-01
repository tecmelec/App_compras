'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import EstadoBadge from '@/components/EstadoBadge';
import ObraCelda from '@/components/ObraCelda';
import ExportarExcelBoton, { type ColumnaExcel } from '@/components/ExportarExcelBoton';
import FiltrosRapidosSolicitudes, { type ConfigFiltrosRapidos, type ModoRapido } from '@/components/FiltrosRapidosSolicitudes';

export type PedidoFila = {
  id: string;
  numero_app: string;
  numero_tecmelec: string | null;
  nro_obra?: string;
  nombre_obra?: string;
  solicitante: string;
  solicitante_id?: string | null;
  comprador?: string | null;
  // La solicitud está asignada a la persona conectada (o a quien sustituye).
  asignada_a_mi?: boolean;
  total_estimado: number;
  requiere_aprobacion: boolean;
  aprobado: boolean | null;
  estado: string | null;
  // true = todos sus Pedidos Tecmelec con "PDF enviado"; false = falta alguno;
  // null = la solicitud aún no tiene Nº de pedido Tecmelec.
  pdf_enviado?: boolean | null;
  created_at: string;
};

type Filtros = {
  busqueda: string;
  numeroApp: string;
  numeroTecmelec: string;
  nroObra: string;
  solicitantes: string[];
  compradores: string[];
  aprobaciones: string[];
  estados: string[];
  pdfEnviado: string[];
  precioMin: string;
  precioMax: string;
  fechaDesde: string;
  fechaHasta: string;
};

const FILTROS_VACIOS: Filtros = {
  busqueda: '',
  numeroApp: '',
  numeroTecmelec: '',
  nroObra: '',
  solicitantes: [],
  compradores: [],
  aprobaciones: [],
  estados: [],
  pdfEnviado: [],
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

const OPCIONES_PDF_ENVIADO = [
  { value: 'si', label: 'Sí' },
  { value: 'no', label: 'No' },
  { value: 'sin', label: 'Sin pedido Tecmelec' },
];

function pdfEnviadoDe(p: PedidoFila): 'si' | 'no' | 'sin' {
  if (p.pdf_enviado === null || p.pdf_enviado === undefined) return 'sin';
  return p.pdf_enviado ? 'si' : 'no';
}

function aprobacionDe(p: PedidoFila): 'automatica' | 'pendiente' | 'aprobada' | 'rechazada' {
  if (!p.requiere_aprobacion) return 'automatica';
  if (p.aprobado === null) return 'pendiente';
  return p.aprobado ? 'aprobada' : 'rechazada';
}

export default function SolicitudesFiltrables({
  pedidos,
  linkBase,
  mostrarComprador = false,
  mostrarPdfEnviado = false,
  filtrosRapidos,
}: {
  pedidos: PedidoFila[];
  linkBase: string;
  mostrarComprador?: boolean;
  mostrarPdfEnviado?: boolean;
  // Si se pasa, muestra la barra Todas / Asignadas a mí / Por usuario / Por obra.
  filtrosRapidos?: ConfigFiltrosRapidos;
}) {
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [modoRapido, setModoRapidoEstado] = useState<ModoRapido>('todas');
  const [guardados, setGuardados] = useState(filtrosRapidos?.guardados ?? { solicitantes: [], obras: [] });

  // Recuerda el último filtro rápido usado en este navegador.
  useEffect(() => {
    if (!filtrosRapidos) return;
    try {
      const m = localStorage.getItem('solicitudes.filtroRapido') as ModoRapido | null;
      if (m === 'mias' || m === 'usuario' || m === 'obra') setModoRapidoEstado(m);
    } catch {}
  }, [filtrosRapidos]);

  function setModoRapido(m: ModoRapido) {
    setModoRapidoEstado(m);
    try {
      localStorage.setItem('solicitudes.filtroRapido', m);
    } catch {}
  }

  function cumpleRapido(p: PedidoFila, modo: ModoRapido) {
    if (modo === 'mias') return !!p.asignada_a_mi;
    if (modo === 'usuario') return !!p.solicitante_id && guardados.solicitantes.includes(p.solicitante_id);
    if (modo === 'obra') return !!p.nro_obra && guardados.obras.includes(p.nro_obra);
    return true;
  }

  const conteos = useMemo(
    () => ({
      todas: pedidos.length,
      mias: pedidos.filter((p) => cumpleRapido(p, 'mias')).length,
      usuario: pedidos.filter((p) => cumpleRapido(p, 'usuario')).length,
      obra: pedidos.filter((p) => cumpleRapido(p, 'obra')).length,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pedidos, guardados]
  );
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

  const hayFiltrosActivos = JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS) || modoRapido !== 'todas';

  const filtrados = pedidos.filter((p) => {
    if (filtrosRapidos && !cumpleRapido(p, modoRapido)) return false;
    if (filtros.busqueda) {
      const palabras = filtros.busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const texto = `${p.numero_app} ${p.numero_tecmelec || ''} ${p.solicitante} ${p.comprador || ''} ${
        p.nro_obra || ''
      } ${p.nombre_obra || ''}`.toLowerCase();
      const coincide = palabras.every((palabra) => texto.includes(palabra));
      if (!coincide) return false;
    }
    if (filtros.numeroApp && !p.numero_app.toLowerCase().includes(filtros.numeroApp.toLowerCase())) return false;
    if (
      filtros.numeroTecmelec &&
      !(p.numero_tecmelec || '').toLowerCase().includes(filtros.numeroTecmelec.toLowerCase())
    )
      return false;
    if (filtros.nroObra) {
      const texto = filtros.nroObra.toLowerCase();
      const coincideNumero = (p.nro_obra || '').toLowerCase().includes(texto);
      const coincideNombre = (p.nombre_obra || '').toLowerCase().includes(texto);
      if (!coincideNumero && !coincideNombre) return false;
    }
    if (filtros.solicitantes.length > 0 && !filtros.solicitantes.includes(p.solicitante)) return false;
    if (mostrarComprador && filtros.compradores.length > 0 && !filtros.compradores.includes(p.comprador || ''))
      return false;
    if (filtros.aprobaciones.length > 0 && !filtros.aprobaciones.includes(aprobacionDe(p))) return false;
    if (filtros.estados.length > 0 && !filtros.estados.includes(p.estado || '')) return false;
    if (mostrarPdfEnviado && filtros.pdfEnviado.length > 0 && !filtros.pdfEnviado.includes(pdfEnviadoDe(p)))
      return false;
    if (filtros.precioMin && p.total_estimado < Number(filtros.precioMin)) return false;
    if (filtros.precioMax && p.total_estimado > Number(filtros.precioMax)) return false;
    if (filtros.fechaDesde && new Date(p.created_at) < new Date(filtros.fechaDesde)) return false;
    if (filtros.fechaHasta && new Date(p.created_at) > new Date(filtros.fechaHasta + 'T23:59:59')) return false;
    return true;
  });

  function actualizar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function alternarValorLista(
    campo: 'solicitantes' | 'compradores' | 'aprobaciones' | 'estados' | 'pdfEnviado',
    valor: string
  ) {
    setFiltros((prev) => {
      const lista = prev[campo];
      const nueva = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
      return { ...prev, [campo]: nueva };
    });
  }

  return (
    <div>
      {filtrosRapidos && (
        <FiltrosRapidosSolicitudes
          modo={modoRapido}
          onModo={setModoRapido}
          conteos={conteos}
          config={filtrosRapidos}
          guardados={guardados}
          onGuardados={setGuardados}
        />
      )}

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
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
            placeholder="Buscar por Nº pedido APP, Nº pedido Tecmelec, solicitante u obra..."
            value={filtros.busqueda}
            onChange={(e) => actualizar('busqueda', e.target.value)}
          />
        </div>

        {hayFiltrosActivos && (
          <button
            onClick={() => {
              setFiltros(FILTROS_VACIOS);
              if (filtrosRapidos) setModoRapido('todas');
            }}
            className="text-sm text-marca hover:underline"
          >
            ✕ Borrar filtros
          </button>
        )}

        <ExportarExcelBoton
          className="ml-auto"
          filas={filtrados}
          nombreArchivo="Solicitudes"
          nombreHoja="Solicitudes"
          columnas={
            [
              { titulo: 'Nº pedido APP', valor: (p) => p.numero_app, ancho: 15 },
              { titulo: 'Solicitante', valor: (p) => p.solicitante, ancho: 25 },
              ...(mostrarComprador ? [{ titulo: 'Comprador', valor: (p) => p.comprador, ancho: 25 } as ColumnaExcel<PedidoFila>] : []),
              ...(filtrosRapidos ? [{ titulo: 'Asignada a mí', valor: (p) => !!p.asignada_a_mi, ancho: 13 } as ColumnaExcel<PedidoFila>] : []),
              { titulo: 'Nº pedido Tecmelec', valor: (p) => (p.numero_tecmelec === '—' ? '' : p.numero_tecmelec), ancho: 22 },
              { titulo: 'Nro. de obra', valor: (p) => p.nro_obra, ancho: 14 },
              { titulo: 'Obra', valor: (p) => p.nombre_obra, ancho: 35 },
              { titulo: 'Precio', valor: (p) => p.total_estimado, formato: 'moneda', ancho: 12 },
              { titulo: 'Aprobación', valor: (p) => ({ automatica: 'Automática', pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' } as const)[aprobacionDe(p)], ancho: 13 },
              { titulo: 'Estado', valor: (p) => p.estado, ancho: 20 },
              ...(mostrarPdfEnviado
                ? [
                    {
                      titulo: 'PDF enviado',
                      valor: (p) => ({ si: 'Sí', no: 'No', sin: '' } as const)[pdfEnviadoDe(p)],
                      ancho: 12,
                    } as ColumnaExcel<PedidoFila>,
                  ]
                : []),
              { titulo: 'Fecha', valor: (p) => p.created_at, formato: 'fecha', ancho: 12 },
            ] as ColumnaExcel<PedidoFila>[]
          }
        />
      </div>

      {columnaAbierta && (
        <div className="fixed inset-0 z-10" onClick={() => setColumnaAbierta(null)} />
      )}

      <div className="bg-white border border-borde rounded-lg overflow-visible">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <ColumnaFiltro
                titulo="Nº pedido APP"
                columnaId="numeroApp"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.numeroApp}
                onLimpiar={() => actualizar('numeroApp', '')}
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
                onLimpiar={() => actualizar('solicitantes', [])}
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
                  onLimpiar={() => actualizar('compradores', [])}
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
                onLimpiar={() => actualizar('numeroTecmelec', '')}
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
                titulo="Nro. de obra"
                columnaId="nroObra"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.nroObra}
                onLimpiar={() => actualizar('nroObra', '')}
              >
                <input
                  className="input"
                  placeholder="Número o nombre..."
                  value={filtros.nroObra}
                  onChange={(e) => actualizar('nroObra', e.target.value)}
                  autoFocus
                />
              </ColumnaFiltro>

              <ColumnaFiltro
                titulo="Precio"
                columnaId="precio"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.precioMin || !!filtros.precioMax}
                onLimpiar={() => { actualizar('precioMin', ''); actualizar('precioMax', ''); }}
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
                onLimpiar={() => actualizar('aprobaciones', [])}
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
                onLimpiar={() => actualizar('estados', [])}
              >
                <ListaChecks
                  opciones={estadosUnicos}
                  seleccionadas={filtros.estados}
                  onToggle={(v) => alternarValorLista('estados', v)}
                />
              </ColumnaFiltro>

              {mostrarPdfEnviado && (
                <ColumnaFiltro
                  titulo="PDF enviado"
                  columnaId="pdfEnviado"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activo={filtros.pdfEnviado.length > 0}
                  onLimpiar={() => actualizar('pdfEnviado', [])}
                >
                  <ListaChecks
                    opciones={OPCIONES_PDF_ENVIADO.map((o) => o.value)}
                    etiquetas={Object.fromEntries(OPCIONES_PDF_ENVIADO.map((o) => [o.value, o.label]))}
                    seleccionadas={filtros.pdfEnviado}
                    onToggle={(v) => alternarValorLista('pdfEnviado', v)}
                  />
                </ColumnaFiltro>
              )}

              <ColumnaFiltro
                titulo="Fecha"
                columnaId="fecha"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activo={!!filtros.fechaDesde || !!filtros.fechaHasta}
                onLimpiar={() => { actualizar('fechaDesde', ''); actualizar('fechaHasta', ''); }}
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
                <td colSpan={12} className="px-4 py-6 text-center text-slate text-sm">
                  No hay solicitudes que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className="hover:bg-fondo">
                  <td className="px-4 py-3">
                    <Link href={`${linkBase}/${p.id}`} className="font-mono text-marca">
                      {p.numero_app}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-grafito">{p.solicitante}</td>
                  {mostrarComprador && (
                    <td className="px-4 py-3 text-grafito">
                      {p.asignada_a_mi ? (
                        <span className="inline-flex items-center gap-1.5 text-marca font-medium whitespace-nowrap" title={p.comprador || undefined}>
                          <span className="w-4 h-4 rounded-full bg-marca text-white flex items-center justify-center">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          </span>
                          Asignada a mí
                        </span>
                      ) : (
                        p.comprador || '—'
                      )}
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-grafito">{p.numero_tecmelec || '—'}</td>
                  <td className="px-4 py-3 font-mono text-grafito">
                    <ObraCelda numero={p.nro_obra || ''} nombre={p.nombre_obra} textoVacio="Sin nombre de obra" />
                  </td>
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
                  {mostrarPdfEnviado && (
                    <td className="px-4 py-3">
                      {pdfEnviadoDe(p) === 'si' && <span className="badge badge-entregado">Sí</span>}
                      {pdfEnviadoDe(p) === 'no' && <span className="badge badge-cancelado">No</span>}
                      {pdfEnviadoDe(p) === 'sin' && <span className="text-slate">—</span>}
                    </td>
                  )}
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
    </div>
  );
}

function ColumnaFiltro({
  titulo,
  columnaId,
  columnaAbierta,
  setColumnaAbierta,
  activo,
  onLimpiar,
  children,
}: {
  titulo: string;
  columnaId: string;
  columnaAbierta: string | null;
  setColumnaAbierta: (v: string | null) => void;
  activo: boolean;
  onLimpiar?: () => void;
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
        className={`flex items-center gap-1 ${activo ? 'text-marca' : ''}`}
      >
        {titulo}
        <span className="text-xs">▾</span>
        {activo && <span className="w-1.5 h-1.5 rounded-full bg-marca" />}
      </button>

      {abierta && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute z-20 top-full left-0 mt-1 bg-white border border-borde rounded-lg shadow-lg p-3 w-56 font-normal normal-case"
        >
          {children}
          {activo && onLimpiar && (
            <button
              onClick={() => {
                onLimpiar();
                setColumnaAbierta(null);
              }}
              className="text-xs text-marca hover:underline mt-2"
            >
              ✕ Borrar filtro de esta columna
            </button>
          )}
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
