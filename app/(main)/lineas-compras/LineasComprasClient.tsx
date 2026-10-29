'use client';

import { useMemo, useState } from 'react';
import { useFiltrosEnSesion } from '@/lib/filtros-sesion';
import Link from 'next/link';
import ColumnaFiltroOrden from '@/components/ColumnaFiltroOrden';
import ObraCelda from '@/components/ObraCelda';
import ComentarioPunto from '@/components/ComentarioPunto';
import EstadoBadge from '@/components/EstadoBadge';
import VerAlbaranBoton from '@/components/VerAlbaranBoton';
import type { FotoAlbaran } from '@/lib/fotos-albaranes';
import ExportarExcelBoton, { type ColumnaExcel } from '@/components/ExportarExcelBoton';
import { formatoPrecioUnitario, formatoImporte } from '@/lib/formato';
import {
  ConfirmacionProveedorCheck,
  ConfirmacionSeguidorCheck,
  RetrasoAviso,
  diasRetraso,
  formatearConfirmacion,
  quienConfirmoFecha,
} from '@/components/FechaEntregaIndicadores';

export type LineaFila = {
  numero_app: string;
  pedido_href: string;
  numero_tecmelec: string | null;
  nro_proveedor: string;
  nombre_proveedor: string;
  articulo: string;
  cantidad: number;
  precio_unitario: number | null; // precio de la línea (BC) o, si aún no tiene, el del catálogo
  importe: number | null; // cantidad × precio unitario
  nro_obra: string;
  nombre_obra: string;
  fecha_requerida: string | null;
  fecha_estimada_entrega: string | null;
  fecha_confirmada_en: string | null; // el proveedor confirmó la fecha estimada (null si no)
  fecha_seguidor_en?: string | null; // el Seguidor IA modificó la fecha estimada (check azul)
  estado_recepcion: string | null;
  comentario_cabecera?: string | null; // comentario de encabezado del PDF del pedido Tecmelec
  comentario_linea?: string | null; // comentario del artículo en el PDF
};

type Filtros = {
  busqueda: string;
  numeroApp: string;
  numeroTecmelec: string;
  nroProveedor: string;
  articulos: string[];
  cantidadMin: string;
  cantidadMax: string;
  precioMin: string;
  precioMax: string;
  importeMin: string;
  importeMax: string;
  nroObra: string;
  requeridaDesde: string;
  requeridaHasta: string;
  entregaDesde: string;
  entregaHasta: string;
  entregaSituacion: string[];
  fotos: string[];
  estados: string[];
};

const FILTROS_VACIOS: Filtros = {
  busqueda: '',
  numeroApp: '',
  numeroTecmelec: '',
  nroProveedor: '',
  articulos: [],
  cantidadMin: '',
  cantidadMax: '',
  precioMin: '',
  precioMax: '',
  importeMin: '',
  importeMax: '',
  nroObra: '',
  requeridaDesde: '',
  requeridaHasta: '',
  entregaDesde: '',
  entregaHasta: '',
  entregaSituacion: [],
  fotos: [],
  estados: [],
};

// Opciones del filtro de situación de la fecha estimada de entrega
const SIT_CONFIRMADA = 'Confirmada por el proveedor';
const SIT_SIN_CONFIRMAR = 'Sin confirmar';
const SIT_RETRASO = 'Con días de retraso';
const SIT_POR_DEFINIR = 'Por definir';

// Opciones del filtro de fotos de albarán
const FOTOS_CON = 'Con fotos de albarán';
const FOTOS_SIN = 'Sin fotos de albarán';

type CampoOrden =
  | 'numero_app'
  | 'numero_tecmelec'
  | 'nro_proveedor'
  | 'articulo'
  | 'cantidad'
  | 'precio_unitario'
  | 'importe'
  | 'nro_obra'
  | 'fecha_requerida'
  | 'fecha_estimada_entrega'
  | 'estado_recepcion'
  | 'fotos';

export default function LineasComprasClient({
  filas,
  mostrarPrecios = false,
  fotosPorPedido = {},
}: {
  filas: LineaFila[];
  // Fotos de albaranes por Nº Pedido Tecmelec (en mayúsculas).
  fotosPorPedido?: Record<string, FotoAlbaran[]>;
  // Precio unitario e importe: solo para comprador, responsable y admin.
  mostrarPrecios?: boolean;
}) {
  const fotosDe = (numero: string | null | undefined) => fotosPorPedido[(numero || '').trim().toUpperCase()] || [];
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [columnaAbierta, setColumnaAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ campo: CampoOrden; asc: boolean } | null>(null);
  // Se conservan al ir al detalle de una solicitud y volver (hasta cambiar de sección).
  useFiltrosEnSesion('lineas-compras', filtros, setFiltros);
  useFiltrosEnSesion('lineas-compras:orden', orden, setOrden);

  const articulosUnicos = useMemo(
    () => Array.from(new Set(filas.map((f) => f.articulo))).sort(),
    [filas]
  );

  const estadosUnicos = useMemo(
    () => Array.from(new Set(filas.map((f) => f.estado_recepcion).filter(Boolean))).sort() as string[],
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

  function alternarEstado(valor: string) {
    setFiltros((prev) => ({
      ...prev,
      estados: prev.estados.includes(valor)
        ? prev.estados.filter((v) => v !== valor)
        : [...prev.estados, valor],
    }));
  }

  function ordenarPor(campo: CampoOrden, asc: boolean) {
    setOrden({ campo, asc });
  }

  const filtradas = filas.filter((f) => {
    if (filtros.busqueda) {
      const palabras = filtros.busqueda.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const texto = `${f.numero_app} ${f.numero_tecmelec || ''} ${f.nro_proveedor} ${f.nombre_proveedor} ${f.articulo} ${f.nro_obra} ${f.nombre_obra}`.toLowerCase();
      const coincide = palabras.every((palabra) => texto.includes(palabra));
      if (!coincide) return false;
    }
    if (filtros.numeroApp && !f.numero_app.toLowerCase().includes(filtros.numeroApp.toLowerCase())) return false;
    if (
      filtros.numeroTecmelec &&
      !(f.numero_tecmelec || '').toLowerCase().includes(filtros.numeroTecmelec.toLowerCase())
    )
      return false;
    if (filtros.nroProveedor) {
      const texto = filtros.nroProveedor.toLowerCase();
      const coincide =
        f.nro_proveedor.toLowerCase().includes(texto) || f.nombre_proveedor.toLowerCase().includes(texto);
      if (!coincide) return false;
    }
    if (filtros.articulos.length > 0 && !filtros.articulos.includes(f.articulo)) return false;
    if (filtros.cantidadMin && f.cantidad < Number(filtros.cantidadMin)) return false;
    if (filtros.cantidadMax && f.cantidad > Number(filtros.cantidadMax)) return false;
    if (mostrarPrecios) {
      if (filtros.precioMin && (f.precio_unitario ?? 0) < Number(filtros.precioMin)) return false;
      if (filtros.precioMax && (f.precio_unitario ?? 0) > Number(filtros.precioMax)) return false;
      if (filtros.importeMin && (f.importe ?? 0) < Number(filtros.importeMin)) return false;
      if (filtros.importeMax && (f.importe ?? 0) > Number(filtros.importeMax)) return false;
    }
    if (filtros.nroObra) {
      const texto = filtros.nroObra.toLowerCase();
      const coincide = f.nro_obra.toLowerCase().includes(texto) || f.nombre_obra.toLowerCase().includes(texto);
      if (!coincide) return false;
    }
    if (filtros.requeridaDesde && (!f.fecha_requerida || new Date(f.fecha_requerida) < new Date(filtros.requeridaDesde)))
      return false;
    if (filtros.requeridaHasta && (!f.fecha_requerida || new Date(f.fecha_requerida) > new Date(filtros.requeridaHasta)))
      return false;
    // Fotos de albarán del pedido de compra
    if (filtros.fotos.length > 0) {
      const tiene = fotosDe(f.numero_tecmelec).length > 0;
      if (!filtros.fotos.includes(tiene ? FOTOS_CON : FOTOS_SIN)) return false;
    }
    // Situación de la fecha estimada: si se marcan varias, vale cualquiera de ellas.
    if (filtros.entregaSituacion.length > 0) {
      const sit: string[] = [];
      if (!f.fecha_estimada_entrega) sit.push(SIT_POR_DEFINIR);
      else sit.push(f.fecha_confirmada_en || f.fecha_seguidor_en ? SIT_CONFIRMADA : SIT_SIN_CONFIRMAR);
      if (diasRetraso(f.fecha_estimada_entrega, f.estado_recepcion) > 0) sit.push(SIT_RETRASO);
      if (!filtros.entregaSituacion.some((x) => sit.includes(x))) return false;
    }
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
    if (filtros.estados.length > 0 && !filtros.estados.includes(f.estado_recepcion || '')) return false;
    return true;
  });

  const ordenadas = useMemo(() => {
    if (!orden) return filtradas;
    const copia = [...filtradas];
    copia.sort((a, b) => {
      // "fotos" no es un campo de la fila: se ordena por el nº de fotos de albarán del pedido
      let va: any = orden.campo === 'fotos' ? fotosDe(a.numero_tecmelec).length : (a as any)[orden.campo];
      let vb: any = orden.campo === 'fotos' ? fotosDe(b.numero_tecmelec).length : (b as any)[orden.campo];
      if (orden.campo === 'fotos' || orden.campo === 'cantidad' || orden.campo === 'precio_unitario' || orden.campo === 'importe') {
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
            data-tour="lineas-buscador"
            className="input input-icon-left w-full"
            placeholder="Buscar por Nº solicitud, Nº pedido Tecmelec o artículo..."
            value={filtros.busqueda}
            onChange={(e) => actualizar('busqueda', e.target.value)}
          />
        </div>

        {hayFiltrosActivos && (
          <button onClick={() => setFiltros(FILTROS_VACIOS)} className="text-sm text-marca hover:underline">
            ✕ Borrar filtros
          </button>
        )}

        <ExportarExcelBoton
          className="ml-auto"
          filas={ordenadas}
          nombreArchivo="Lineas_compras"
          nombreHoja="Líns. compras"
          columnas={[
            { titulo: 'Nº solicitud', valor: (f) => f.numero_app, ancho: 15 },
            { titulo: 'Nº pedido Tecmelec', valor: (f) => f.numero_tecmelec, ancho: 18 },
            { titulo: 'Nro. Proveedor', valor: (f) => f.nro_proveedor, ancho: 14 },
            { titulo: 'Proveedor', valor: (f) => f.nombre_proveedor, ancho: 35 },
            { titulo: 'Artículo solicitado', valor: (f) => f.articulo, ancho: 40 },
            { titulo: 'Cantidad', valor: (f) => f.cantidad, formato: 'numero', ancho: 10 },
            ...(mostrarPrecios
              ? ([
                  { titulo: 'Precio unitario', valor: (f) => f.precio_unitario, formato: 'precio', ancho: 14 },
                  { titulo: 'Importe', valor: (f) => f.importe, formato: 'moneda', ancho: 14 },
                ] as ColumnaExcel<LineaFila>[])
              : []),
            { titulo: 'Nro. de obra', valor: (f) => f.nro_obra, ancho: 14 },
            { titulo: 'Obra', valor: (f) => f.nombre_obra, ancho: 35 },
            { titulo: 'Fecha requerida', valor: (f) => f.fecha_requerida, formato: 'fecha', ancho: 15 },
            { titulo: 'Fecha estimada de entrega', valor: (f) => f.fecha_estimada_entrega, formato: 'fecha', ancho: 22 },
            {
              titulo: 'Fecha confirmada',
              valor: (f) => (f.fecha_estimada_entrega && quienConfirmoFecha(f.fecha_confirmada_en, f.fecha_seguidor_en) ? 'Sí' : 'No'),
              ancho: 16,
            },
            {
              titulo: 'Confirmada por',
              valor: (f) => {
                const c = f.fecha_estimada_entrega ? quienConfirmoFecha(f.fecha_confirmada_en, f.fecha_seguidor_en) : null;
                return c ? (c.quien === 'seguidor' ? 'Seguidor IA' : 'Proveedor') : '';
              },
              ancho: 16,
            },
            {
              titulo: 'Últ. actualización',
              valor: (f) => {
                const c = f.fecha_estimada_entrega ? quienConfirmoFecha(f.fecha_confirmada_en, f.fecha_seguidor_en) : null;
                return c ? formatearConfirmacion(c.en) : '';
              },
              ancho: 22,
            },
            {
              titulo: 'Días de retraso',
              valor: (f) => diasRetraso(f.fecha_estimada_entrega, f.estado_recepcion),
              formato: 'numero',
              ancho: 14,
            },
            { titulo: 'Estado', valor: (f) => f.estado_recepcion, ancho: 20 },
            {
              titulo: 'Fotos albarán',
              valor: (f) => fotosDe(f.numero_tecmelec).length || null,
              formato: 'numero',
              ancho: 14,
            },
          ]}
        />
      </div>

      {columnaAbierta && <div className="fixed inset-0 z-10" onClick={() => setColumnaAbierta(null)} />}

      <div className="bg-white border border-borde rounded-lg overflow-visible">
        {/* La tabla tiene su propio scroll (vertical y horizontal) para que la fila de
            títulos quede fija arriba al desplazarse por las líneas. */}
        <div className="overflow-auto max-h-[calc(100vh-15rem)] min-h-[20rem] rounded-lg">
        <table data-tour="lineas-tabla" className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left sticky top-0 z-20 shadow-[0_1px_0_0_#DDE1E0]">
            <tr>
              <ColumnaFiltroOrden
                titulo="Nº solicitud"
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
                titulo="Nro. Proveedor"
                campoOrden="nro_proveedor"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="nroProveedor"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.nroProveedor}
                onLimpiarFiltro={() => actualizar('nroProveedor', '')}
              >
                <input
                  className="input"
                  placeholder="Número o nombre..."
                  value={filtros.nroProveedor}
                  onChange={(e) => actualizar('nroProveedor', e.target.value)}
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

              {mostrarPrecios && (
                <ColumnaFiltroOrden
                  titulo="Precio unitario"
                  campoOrden="precio_unitario"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="precio"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.precioMin || !!filtros.precioMax}
                  onLimpiarFiltro={() => { actualizar('precioMin', ''); actualizar('precioMax', ''); }}
                >
                  <div className="flex flex-col gap-2">
                    <input className="input" type="number" step="any" placeholder="Mínimo" value={filtros.precioMin} onChange={(e) => actualizar('precioMin', e.target.value)} />
                    <input className="input" type="number" step="any" placeholder="Máximo" value={filtros.precioMax} onChange={(e) => actualizar('precioMax', e.target.value)} />
                  </div>
                </ColumnaFiltroOrden>
              )}

              {mostrarPrecios && (
                <ColumnaFiltroOrden
                  titulo="Importe"
                  campoOrden="importe"
                  ordenActual={orden}
                  onOrdenar={ordenarPor}
                  columnaId="importe"
                  columnaAbierta={columnaAbierta}
                  setColumnaAbierta={setColumnaAbierta}
                  activoFiltro={!!filtros.importeMin || !!filtros.importeMax}
                  onLimpiarFiltro={() => { actualizar('importeMin', ''); actualizar('importeMax', ''); }}
                >
                  <div className="flex flex-col gap-2">
                    <input className="input" type="number" step="any" placeholder="Mínimo" value={filtros.importeMin} onChange={(e) => actualizar('importeMin', e.target.value)} />
                    <input className="input" type="number" step="any" placeholder="Máximo" value={filtros.importeMax} onChange={(e) => actualizar('importeMax', e.target.value)} />
                  </div>
                </ColumnaFiltroOrden>
              )}

              <ColumnaFiltroOrden
                titulo="Nro. de obra"
                campoOrden="nro_obra"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="nroObra"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.nroObra}
                onLimpiarFiltro={() => actualizar('nroObra', '')}
              >
                <input
                  className="input"
                  placeholder="Número o nombre..."
                  value={filtros.nroObra}
                  onChange={(e) => actualizar('nroObra', e.target.value)}
                  autoFocus
                />
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
                activoFiltro={!!filtros.entregaDesde || !!filtros.entregaHasta || filtros.entregaSituacion.length > 0}
                onLimpiarFiltro={() => {
                  actualizar('entregaDesde', '');
                  actualizar('entregaHasta', '');
                  actualizar('entregaSituacion', []);
                }}
              >
                <div className="flex flex-col gap-1 mb-3">
                  {[SIT_CONFIRMADA, SIT_SIN_CONFIRMAR, SIT_RETRASO, SIT_POR_DEFINIR].map((op) => (
                    <label key={op} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filtros.entregaSituacion.includes(op)}
                        onChange={() =>
                          actualizar(
                            'entregaSituacion',
                            filtros.entregaSituacion.includes(op)
                              ? filtros.entregaSituacion.filter((x) => x !== op)
                              : [...filtros.entregaSituacion, op]
                          )
                        }
                      />
                      {op}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-slate mb-1">Entre fechas</p>
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

              <ColumnaFiltroOrden
                titulo="Estado"
                campoOrden="estado_recepcion"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="estado"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={filtros.estados.length > 0}
                onLimpiarFiltro={() => actualizar('estados', [])}
              >
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {estadosUnicos.map((e) => (
                    <label key={e} className="flex items-center gap-2 text-sm text-grafito">
                      <input
                        type="checkbox"
                        checked={filtros.estados.includes(e)}
                        onChange={() => alternarEstado(e)}
                      />
                      {e}
                    </label>
                  ))}
                </div>
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Fotos Albaranes"
                campoOrden="fotos"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="fotos"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={filtros.fotos.length > 0}
                onLimpiarFiltro={() => actualizar('fotos', [])}
              >
                <div className="flex flex-col gap-1">
                  {[FOTOS_CON, FOTOS_SIN].map((op) => (
                    <label key={op} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filtros.fotos.includes(op)}
                        onChange={() =>
                          actualizar(
                            'fotos',
                            filtros.fotos.includes(op) ? filtros.fotos.filter((x) => x !== op) : [...filtros.fotos, op]
                          )
                        }
                      />
                      {op}
                    </label>
                  ))}
                </div>
              </ColumnaFiltroOrden>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {ordenadas.length === 0 ? (
              <tr>
                <td colSpan={mostrarPrecios ? 12 : 10} className="px-4 py-6 text-center text-slate text-sm">
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
                  <td className="px-4 py-3 font-mono text-grafito whitespace-nowrap">
                    {f.comentario_cabecera && (
                      <ComentarioPunto titulo={`Comentario del pedido ${f.numero_tecmelec || ''}`} texto={f.comentario_cabecera} />
                    )}
                    {f.numero_tecmelec || '—'}
                  </td>
                  <td className="px-4 py-3 font-mono text-grafito">
                    <ObraCelda numero={f.nro_proveedor} nombre={f.nombre_proveedor} textoVacio="Sin nombre de proveedor" />
                  </td>
                  <td className="px-4 py-3 text-grafito">
                    {f.comentario_linea && <ComentarioPunto titulo={`Comentario de ${f.articulo}`} texto={f.comentario_linea} />}
                    {f.articulo}
                  </td>
                  <td className="px-4 py-3 font-mono text-grafito">{f.cantidad}</td>
                  {mostrarPrecios && (
                    <td className="px-4 py-3 font-mono text-grafito text-right whitespace-nowrap">
                      {f.precio_unitario != null ? `${formatoPrecioUnitario(f.precio_unitario)} €` : '—'}
                    </td>
                  )}
                  {mostrarPrecios && (
                    <td
                      className={`px-4 py-3 font-mono text-right whitespace-nowrap ${
                        f.estado_recepcion === 'Anulado' ? 'text-slate line-through' : 'text-grafito'
                      }`}
                      title={f.estado_recepcion === 'Anulado' ? 'Línea anulada: no cuenta en el total' : undefined}
                    >
                      {f.importe != null ? `${formatoImporte(f.importe)} €` : '—'}
                    </td>
                  )}
                  <td className="px-4 py-3 font-mono text-grafito">
                    <ObraCelda numero={f.nro_obra} nombre={f.nombre_obra} textoVacio="Sin nombre de obra" />
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {f.fecha_requerida
                      ? new Date(f.fecha_requerida + 'T00:00:00').toLocaleDateString('es-ES')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-slate">
                    {f.fecha_estimada_entrega ? (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        <RetrasoAviso dias={diasRetraso(f.fecha_estimada_entrega, f.estado_recepcion)} />
                        {new Date(f.fecha_estimada_entrega).toLocaleDateString('es-ES')}
                        {(() => {
                          const c = quienConfirmoFecha(f.fecha_confirmada_en, f.fecha_seguidor_en);
                          if (!c) return null;
                          return c.quien === 'seguidor' ? (
                            <ConfirmacionSeguidorCheck confirmadaEn={c.en} />
                          ) : (
                            <ConfirmacionProveedorCheck confirmadaEn={c.en} />
                          );
                        })()}
                      </span>
                    ) : (
                      'Por definir'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <EstadoBadge estado={f.estado_recepcion || undefined} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {f.numero_tecmelec && fotosDe(f.numero_tecmelec).length > 0 ? (
                      <VerAlbaranBoton numeroTecmelec={f.numero_tecmelec} fotos={fotosDe(f.numero_tecmelec)} />
                    ) : (
                      <span className="text-slate">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {mostrarPrecios && ordenadas.length > 0 && (
            <tfoot className="bg-marcaClaro border-t border-borde">
              <tr>
                <td colSpan={6} className="px-4 py-3 text-sm text-grafito text-right">
                  Importe total ({ordenadas.length} línea{ordenadas.length === 1 ? '' : 's'}, sin contar las anuladas)
                </td>
                <td className="px-4 py-3 font-mono font-semibold text-marca text-right whitespace-nowrap">
                  {formatoImporte(
                    ordenadas.reduce((s, f) => s + (f.estado_recepcion === 'Anulado' ? 0 : f.importe ?? 0), 0)
                  )}{' '}
                  €
                </td>
                <td colSpan={5} />
              </tr>
            </tfoot>
          )}
        </table>
        </div>
      </div>
    </div>
  );
}

