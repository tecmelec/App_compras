'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import ExportarExcelBoton from '@/components/ExportarExcelBoton';
import {
  buscarArticulosParaAlta,
  comprobarArticuloEnTienda,
  enviarSolicitudAlta,
  cambiarEstadoSolicitudAlta,
  type EstadoAlta,
} from '@/app/actions/alta-articulos';

export type SolicitudAltaFila = {
  id: string;
  bc_item_no: string;
  descripcion: string;
  estado: EstadoAlta;
  created_at: string;
  gestionado_en: string | null;
  solicitante: string;
};

const ESTADOS: EstadoAlta[] = ['Solicitud enviada', 'Rechazada', 'Disponible en tienda'];

function claseEstado(estado: EstadoAlta) {
  if (estado === 'Rechazada') return 'badge-cancelado';
  if (estado === 'Disponible en tienda') return 'badge-entregado';
  return 'badge-proceso';
}

export default function AltaArticulosClient({ filas, esAdmin }: { filas: SolicitudAltaFila[]; esAdmin: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button
          type="button"
          onClick={() => {
            setAviso(null);
            setAbierto(true);
          }}
          className="inline-flex items-center gap-2 bg-marca text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-marcaOscuro2"
        >
          <span className="text-lg leading-none">+</span>
          Solicitar nuevo artículo en tienda
        </button>
        <ExportarExcelBoton
          className="ml-auto"
          filas={filas}
          nombreArchivo="Solicitudes_alta_articulos"
          nombreHoja="Altas de artículos"
          columnas={[
            { titulo: 'Fecha', valor: (f) => f.created_at, formato: 'fecha', ancho: 12 },
            { titulo: 'Código BC', valor: (f) => f.bc_item_no, ancho: 16 },
            { titulo: 'Descripción', valor: (f) => f.descripcion, ancho: 45 },
            ...(esAdmin ? [{ titulo: 'Solicitado por', valor: (f: SolicitudAltaFila) => f.solicitante, ancho: 25 }] : []),
            { titulo: 'Estado', valor: (f) => f.estado, ancho: 20 },
          ]}
        />
      </div>

      {aviso && (
        <p className="text-sm text-verde bg-[#E8F1EC] border border-[#C4DECD] rounded-md px-3 py-2 mb-4">{aviso}</p>
      )}

      <div className="bg-white border border-borde rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <th className="px-4 py-3 font-medium">Fecha</th>
              <th className="px-4 py-3 font-medium">Código BC</th>
              <th className="px-4 py-3 font-medium">Descripción</th>
              {esAdmin && <th className="px-4 py-3 font-medium">Solicitado por</th>}
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {filas.length === 0 ? (
              <tr>
                <td colSpan={esAdmin ? 5 : 4} className="px-4 py-6 text-center text-slate">
                  Todavía no hay solicitudes de alta de artículos.
                </td>
              </tr>
            ) : (
              filas.map((f) => (
                <tr key={f.id} className="hover:bg-fondo">
                  <td className="px-4 py-3 text-slate whitespace-nowrap">{new Date(f.created_at).toLocaleDateString('es-ES')}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{f.bc_item_no}</td>
                  <td className="px-4 py-3 text-grafito">{f.descripcion}</td>
                  {esAdmin && <td className="px-4 py-3 text-grafito">{f.solicitante}</td>}
                  <td className="px-4 py-3">
                    {esAdmin ? <SelectorEstado fila={f} /> : <span className={`badge ${claseEstado(f.estado)}`}>{f.estado}</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {abierto && (
        <ModalSolicitud
          onCerrar={() => setAbierto(false)}
          onEnviada={(desc) => {
            setAbierto(false);
            setAviso(`Solicitud enviada para "${desc}".`);
          }}
        />
      )}
    </div>
  );
}

function SelectorEstado({ fila }: { fila: SolicitudAltaFila }) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoAlta>(fila.estado);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => setEstado(fila.estado), [fila.estado]);

  return (
    <select
      value={estado}
      disabled={guardando}
      onChange={async (e) => {
        const nuevo = e.target.value as EstadoAlta;
        const anterior = estado;
        setEstado(nuevo);
        setGuardando(true);
        const r = await cambiarEstadoSolicitudAlta(fila.id, nuevo);
        setGuardando(false);
        if (r.error) {
          setEstado(anterior);
          alert(r.error);
          return;
        }
        router.refresh();
      }}
      className={`badge ${claseEstado(estado)} cursor-pointer pr-6 disabled:opacity-60`}
    >
      {ESTADOS.map((e) => (
        <option key={e} value={e}>
          {e}
        </option>
      ))}
    </select>
  );
}

type ArticuloBC = { No: string; Description: string };

function ModalSolicitud({ onCerrar, onEnviada }: { onCerrar: () => void; onEnviada: (descripcion: string) => void }) {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [campoActivo, setCampoActivo] = useState<'codigo' | 'descripcion' | null>(null);
  const [resultados, setResultados] = useState<ArticuloBC[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [seleccionado, setSeleccionado] = useState<ArticuloBC | null>(null);
  const [comprobando, setComprobando] = useState(false);
  const [estadoTienda, setEstadoTienda] = useState<{ disponible: boolean; solicitudPendiente: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contador = useRef(0);

  // Búsqueda en BC mientras se escribe (en el campo que se esté usando).
  useEffect(() => {
    if (seleccionado || !campoActivo) return;
    const texto = campoActivo === 'codigo' ? codigo : descripcion;
    if (texto.trim().length < 2) {
      setResultados([]);
      return;
    }
    const id = ++contador.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarArticulosParaAlta(texto, campoActivo);
      if (id !== contador.current) return;
      setBuscando(false);
      setError(r.error || null);
      setResultados(r.articulos || []);
    }, 350);
    return () => clearTimeout(t);
  }, [codigo, descripcion, campoActivo, seleccionado]);

  async function elegir(a: ArticuloBC) {
    setSeleccionado(a);
    setCodigo(a.No);
    setDescripcion(a.Description);
    setResultados([]);
    setEstadoTienda(null);
    setError(null);
    setComprobando(true);
    const r = await comprobarArticuloEnTienda(a.No);
    setComprobando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    setEstadoTienda({ disponible: !!r.disponible, solicitudPendiente: !!r.solicitudPendiente });
  }

  function cambiarTexto(campo: 'codigo' | 'descripcion', valor: string) {
    setCampoActivo(campo);
    if (campo === 'codigo') setCodigo(valor);
    else setDescripcion(valor);
    if (seleccionado) {
      // Al tocar un campo después de elegir, se vuelve a buscar.
      setSeleccionado(null);
      setEstadoTienda(null);
      if (campo === 'codigo') setDescripcion('');
      else setCodigo('');
    }
  }

  async function enviar() {
    if (!seleccionado) return;
    setEnviando(true);
    setError(null);
    const r = await enviarSolicitudAlta(seleccionado.No, seleccionado.Description);
    setEnviando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    router.refresh();
    onEnviada(seleccionado.Description);
  }

  const puedeEnviar = !!seleccionado && !!estadoTienda && !estadoTienda.disponible && !estadoTienda.solicitudPendiente;

  const listaResultados = (campo: 'codigo' | 'descripcion') =>
    campoActivo === campo && !seleccionado && (buscando || resultados.length > 0 || (campo === 'codigo' ? codigo : descripcion).trim().length >= 2) ? (
      <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-white border border-borde rounded-lg shadow-lg max-h-64 overflow-y-auto">
        {buscando && <p className="text-xs text-slate px-3 py-2">Buscando en Business Central…</p>}
        {!buscando && resultados.length === 0 && <p className="text-xs text-slate px-3 py-2">Sin resultados.</p>}
        {!buscando &&
          resultados.map((a) => (
            <button
              key={a.No}
              type="button"
              onClick={() => elegir(a)}
              className="w-full text-left px-3 py-2 hover:bg-fondo border-b border-borde last:border-0"
            >
              <span className="block font-mono text-xs text-marca">{a.No}</span>
              <span className="block text-sm text-grafito">{a.Description}</span>
            </button>
          ))}
      </div>
    ) : null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6" onMouseDown={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-grafito mb-1">Solicitar nuevo artículo en tienda</h2>
        <p className="text-sm text-slate mb-5">Busca el artículo en Business Central por su código o por su descripción.</p>

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm text-slate mb-1">Código BC</label>
            <input
              className="input w-full font-mono"
              value={codigo}
              onChange={(e) => cambiarTexto('codigo', e.target.value)}
              onFocus={() => !seleccionado && setCampoActivo('codigo')}
              placeholder="Ej.: 100234"
              autoFocus
            />
            {listaResultados('codigo')}
          </div>
          <div className="relative">
            <label className="block text-sm text-slate mb-1">Descripción del producto en BC</label>
            <input
              className="input w-full"
              value={descripcion}
              onChange={(e) => cambiarTexto('descripcion', e.target.value)}
              onFocus={() => !seleccionado && setCampoActivo('descripcion')}
              placeholder="Ej.: cinta aislante"
            />
            {listaResultados('descripcion')}
          </div>
        </div>

        <div className="mt-4 min-h-[2.5rem]">
          {comprobando && <p className="text-sm text-slate">Comprobando si ya está en la tienda…</p>}
          {estadoTienda?.disponible && (
            <p className="text-sm text-verde bg-[#E8F1EC] border border-[#C4DECD] rounded-md px-3 py-2">
              Este artículo ya está disponible en la tienda.
            </p>
          )}
          {estadoTienda && !estadoTienda.disponible && estadoTienda.solicitudPendiente && (
            <p className="text-sm text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2">
              Ya hay una solicitud pendiente para este artículo.
            </p>
          )}
          {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onCerrar} className="text-sm text-slate hover:text-grafito px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={enviar}
            disabled={!puedeEnviar || enviando}
            className="text-sm bg-marca text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {enviando ? 'Enviando…' : 'Enviar solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}
