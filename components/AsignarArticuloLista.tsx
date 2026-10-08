'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buscarArticulosParaAlta } from '@/app/actions/alta-articulos';
import { asignarArticuloLineaListaFoto, datosArticuloParaAsignar } from '@/app/actions/lista-foto';
import ComboboxProveedor from '@/components/ComboboxProveedor';
import { ajustarAMultiplo } from '@/lib/lista-foto-tipos';

type ArticuloBC = { No: string; Description: string };
type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };
type Datos = {
  bc_item_no: string;
  descripcion: string;
  unidad: string;
  multiplo: number;
  precio: number;
  proveedor_id: string | null;
  en_tienda: boolean;
};

// Asignar un artículo de BC a una línea pendiente de la lista en foto. Mismo buscador
// que "Solicitar alta de artículos" (por código o por descripción). El comprador
// (y el admin) indican además precio y proveedor.
export default function AsignarArticuloLista({
  listaId,
  n,
  texto,
  cantidadEscrita,
  conPrecio,
  proveedores = [],
  cambiar = false,
}: {
  cambiar?: boolean;
  listaId: string;
  n: number;
  texto: string;
  cantidadEscrita: number | null;
  conPrecio: boolean;
  proveedores?: Proveedor[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="text-xs text-marca font-medium hover:underline mt-1">
        {cambiar ? 'Cambiar artículo' : 'Asignar artículo'}
      </button>
      {abierto && (
        <Modal
          listaId={listaId}
          n={n}
          texto={texto}
          cantidadEscrita={cantidadEscrita}
          conPrecio={conPrecio}
          proveedores={proveedores}
          cambiar={cambiar}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function Modal({
  listaId,
  n,
  texto,
  cantidadEscrita,
  conPrecio,
  proveedores,
  cambiar,
  onCerrar,
}: {
  cambiar: boolean;
  listaId: string;
  n: number;
  texto: string;
  cantidadEscrita: number | null;
  conPrecio: boolean;
  proveedores: Proveedor[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [codigo, setCodigo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [campoActivo, setCampoActivo] = useState<'codigo' | 'descripcion' | null>(null);
  const [resultados, setResultados] = useState<ArticuloBC[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [datos, setDatos] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(false);
  const [cantidad, setCantidad] = useState('');
  const [precio, setPrecio] = useState('');
  const [proveedorId, setProveedorId] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contador = useRef(0);

  // Búsqueda en BC mientras se escribe (en el campo que se esté usando).
  useEffect(() => {
    if (datos || !campoActivo) return;
    const t0 = campoActivo === 'codigo' ? codigo : descripcion;
    if (t0.trim().length < 2) {
      setResultados([]);
      return;
    }
    const id = ++contador.current;
    setBuscando(true);
    const t = setTimeout(async () => {
      const r = await buscarArticulosParaAlta(t0, campoActivo);
      if (id !== contador.current) return;
      setBuscando(false);
      setError(r.error || null);
      setResultados(r.articulos || []);
    }, 350);
    return () => clearTimeout(t);
  }, [codigo, descripcion, campoActivo, datos]);

  async function elegir(a: ArticuloBC) {
    setCodigo(a.No);
    setDescripcion(a.Description);
    setResultados([]);
    setError(null);
    setCargando(true);
    const r = await datosArticuloParaAsignar(a.No);
    setCargando(false);
    if (r.error || !r.articulo) {
      setError(r.error || 'No se pudo leer el artículo.');
      return;
    }
    setDatos(r.articulo);
    setCantidad(String(ajustarAMultiplo(cantidadEscrita ?? r.articulo.multiplo, r.articulo.multiplo) ?? ''));
    setPrecio(String(r.articulo.precio ?? ''));
    setProveedorId(r.articulo.proveedor_id || '');
  }

  function cambiarTexto(campo: 'codigo' | 'descripcion', valor: string) {
    setCampoActivo(campo);
    if (campo === 'codigo') setCodigo(valor);
    else setDescripcion(valor);
    if (datos) {
      setDatos(null);
      if (campo === 'codigo') setDescripcion('');
      else setCodigo('');
    }
  }

  const multiplo = datos?.multiplo && datos.multiplo > 1 ? datos.multiplo : 1;
  const cantidadNum = Number(cantidad);
  const errorCantidad = !datos
    ? null
    : !Number.isInteger(cantidadNum) || cantidadNum <= 0
      ? 'Indica una cantidad entera.'
      : cantidadNum % multiplo !== 0
        ? `Debe ser múltiplo de ${multiplo}.`
        : null;
  const errorPrecio = conPrecio && datos && !(Number(precio.replace(',', '.')) > 0) ? 'Indica un precio mayor que 0.' : null;

  async function guardar() {
    if (!datos || errorCantidad || errorPrecio) return;
    setGuardando(true);
    setError(null);
    const r = await asignarArticuloLineaListaFoto({
      listaId,
      n,
      bcItemNo: datos.bc_item_no,
      cantidad: cantidadNum,
      precio: conPrecio ? Number(precio.replace(',', '.')) : null,
      proveedorId: conPrecio ? proveedorId || null : null,
    });
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    router.refresh();
    onCerrar();
  }

  const listaResultados = (campo: 'codigo' | 'descripcion') =>
    campoActivo === campo && !datos && (buscando || resultados.length > 0 || (campo === 'codigo' ? codigo : descripcion).trim().length >= 2) ? (
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
        <h2 className="text-lg font-semibold text-grafito mb-1">{cambiar ? 'Cambiar artículo asignado' : 'Asignar artículo'}</h2>
        <p className="text-sm text-slate mb-1">
          Escrito en la lista: <span className="italic text-grafito">“{texto}”</span>
        </p>
        <p className="text-sm text-slate mb-2">Busca el artículo en Business Central por su código o por su descripción.</p>
        {cambiar && (
          <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-4">
            La línea asignada actualmente se sustituirá por la nueva (artículo, cantidad{conPrecio ? ', precio y proveedor' : ''}).
          </p>
        )}

        <div className="space-y-4">
          <div className="relative">
            <label className="block text-sm text-slate mb-1">Código BC</label>
            <input
              className="input w-full font-mono"
              value={codigo}
              onChange={(e) => cambiarTexto('codigo', e.target.value)}
              onFocus={() => !datos && setCampoActivo('codigo')}
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
              onFocus={() => !datos && setCampoActivo('descripcion')}
              placeholder="Ej.: cinta aislante"
            />
            {listaResultados('descripcion')}
          </div>

          {cargando && <p className="text-sm text-slate">Leyendo el artículo en Business Central…</p>}

          {datos && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-sm text-slate mb-1">Cantidad ({datos.unidad})</label>
                <input
                  type="number"
                  min={multiplo}
                  step={multiplo}
                  className="input w-full"
                  value={cantidad}
                  onChange={(e) => setCantidad(e.target.value)}
                />
                {multiplo > 1 && <p className="text-xs text-marca mt-0.5">Múltiplo de {multiplo}</p>}
                {errorCantidad && <p className="text-xs text-rojo mt-0.5">{errorCantidad}</p>}
              </div>
              {conPrecio && (
                <div>
                  <label className="block text-sm text-slate mb-1">Precio unitario (€)</label>
                  <input
                    inputMode="decimal"
                    className="input w-full"
                    value={precio}
                    onChange={(e) => setPrecio(e.target.value)}
                  />
                  {errorPrecio && <p className="text-xs text-rojo mt-0.5">{errorPrecio}</p>}
                </div>
              )}
              {conPrecio && (
                <div className="col-span-2">
                  <label className="block text-sm text-slate mb-1">Proveedor</label>
                  <ComboboxProveedor proveedores={proveedores} value={proveedorId} onChange={setProveedorId} className="w-full" />
                </div>
              )}
              {!datos.en_tienda && (
                <p className="col-span-2 text-xs text-slate">
                  No está publicado en la tienda: se añade solo a esta solicitud.
                </p>
              )}
            </div>
          )}

          {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2">{error}</p>}
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onCerrar} className="text-sm text-slate hover:text-grafito px-4 py-2">
            Cancelar
          </button>
          <button
            type="button"
            onClick={guardar}
            disabled={!datos || !!errorCantidad || !!errorPrecio || guardando}
            className="text-sm bg-marca text-white rounded-lg px-4 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {guardando ? 'Guardando…' : cambiar ? 'Sustituir en la solicitud' : 'Añadir a la solicitud'}
          </button>
        </div>
      </div>
    </div>
  );
}
