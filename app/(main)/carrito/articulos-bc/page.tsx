'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { articuloParaCarrito, buscarArticulosCatalogo } from '@/app/actions/catalogo-bc';
import { ajustarAMultiplo } from '@/lib/lista-foto-tipos';
import { esCantidadValida, esMultiploDe, leerCantidad, pasoCantidad } from '@/lib/cantidad';

type Articulo = {
  no: string;
  descripcion: string;
  categoria: string | null;
  fabricante: string | null;
  unidad: string | null;
  precio: number | null;
  enTienda: boolean;
};

type Preparado = {
  producto_id: string;
  nombre: string;
  imagen_url: string | null;
  multiplo_compra: number;
  unidad_medida: string | null;
};

// "Crear desde artículos de BC": el catálogo completo de BC (réplica de
// ALTA-PRODUCTOS-BC), con la misma búsqueda que su pestaña "Productos". Doble clic en
// el código (o "+") para indicar la cantidad y añadirlo al carrito. Sin IA.
export default function ArticulosBCPage() {
  const { addItem, totalItems, rol } = useCart();
  const [busqueda, setBusqueda] = useState('');
  const [articulos, setArticulos] = useState<Articulo[]>([]);
  const [hayMas, setHayMas] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [elegido, setElegido] = useState<Articulo | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const contador = useRef(0);

  async function cargar(texto: string, desde: number) {
    const id = ++contador.current;
    setCargando(true);
    const r = await buscarArticulosCatalogo(texto, desde);
    if (id !== contador.current) return;
    setCargando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setError(null);
    setArticulos((prev) => (desde === 0 ? r.articulos || [] : [...prev, ...(r.articulos || [])]));
    setHayMas(!!r.hayMas);
  }

  // Búsqueda mientras se escribe
  useEffect(() => {
    const t = setTimeout(() => cargar(busqueda, 0), 300);
    return () => clearTimeout(t);
  }, [busqueda]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 2500);
    return () => clearTimeout(t);
  }, [aviso]);

  if (rol === 'usuario') {
    return (
      <div className="p-4 sm:p-8">
        <p className="text-sm text-slate">Esta herramienta no está disponible para tu perfil.</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-8 max-w-6xl">
      <Link href="/carrito" className="text-sm text-slate hover:text-grafito">
        ← Volver al carrito{totalItems > 0 ? ` (${totalItems})` : ''}
      </Link>
      <h1 className="text-2xl font-semibold text-grafito mt-2 mb-1">Crear desde artículos de BC</h1>
      <p className="text-sm text-slate mb-5">
        Todo el catálogo de artículos de Business Central. Haz doble clic en el código (o pulsa +) para indicar la
        cantidad y añadirlo al carrito.
      </p>

      <input
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por código o descripción…"
        className="input w-full max-w-md mb-4"
        autoFocus
      />

      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-4">{error}</p>
      )}

      <div className="bg-white border border-borde rounded-lg overflow-auto max-h-[calc(100vh-17rem)] min-h-[16rem]">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left sticky top-0 z-10 shadow-[0_1px_0_0_#DDE1E0]">
            <tr className="text-xs uppercase tracking-wide">
              <th className="px-4 py-3 font-semibold">Nº</th>
              <th className="px-4 py-3 font-semibold">Descripción</th>
              <th className="px-4 py-3 font-semibold">Categoría</th>
              <th className="px-4 py-3 font-semibold">Fabricante</th>
              <th className="px-4 py-3 font-semibold">U.M.</th>
              <th className="px-2 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {articulos.map((a) => (
              <tr key={a.no} className="hover:bg-fondo/60">
                <td
                  className="px-4 py-3 font-mono font-semibold text-[#2563EB] whitespace-nowrap cursor-pointer select-none"
                  onDoubleClick={() => setElegido(a)}
                  title="Doble clic para añadir al carrito"
                >
                  {a.no}
                </td>
                <td className="px-4 py-3 text-grafito">
                  {a.descripcion}
                  {a.enTienda && (
                    <span className="ml-2 text-[10px] font-medium text-marca bg-marcaClaro rounded px-1.5 py-0.5 align-middle">
                      EN TIENDA
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-slate">{a.categoria || '-'}</td>
                <td className="px-4 py-3 text-grafito font-medium">{a.fabricante || '-'}</td>
                <td className="px-4 py-3 text-slate">{a.unidad || '-'}</td>
                <td className="px-2 py-3 text-right">
                  <button
                    type="button"
                    onClick={() => setElegido(a)}
                    className="w-8 h-8 rounded-md border border-borde text-marca hover:border-marca hover:bg-marcaClaro font-semibold"
                    aria-label={`Añadir ${a.no} al carrito`}
                    title="Añadir al carrito"
                  >
                    +
                  </button>
                </td>
              </tr>
            ))}
            {!cargando && articulos.length === 0 && !error && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-slate">
                  No hay artículos que coincidan.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {cargando && <p className="text-xs text-slate px-4 py-3">Cargando…</p>}
        {!cargando && hayMas && (
          <div className="px-4 py-3">
            <button type="button" onClick={() => cargar(busqueda, articulos.length)} className="btn-secondary">
              Cargar más
            </button>
          </div>
        )}
      </div>

      {elegido && (
        <ModalCantidad
          articulo={elegido}
          onCerrar={() => setElegido(null)}
          onAnadido={(texto) => {
            setElegido(null);
            setAviso(texto);
          }}
          addItem={addItem}
        />
      )}

      {aviso && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-grafito text-white text-sm rounded-lg px-4 py-2 shadow-lg">
          {aviso}
        </div>
      )}
    </div>
  );
}

function ModalCantidad({
  articulo,
  onCerrar,
  onAnadido,
  addItem,
}: {
  articulo: Articulo;
  onCerrar: () => void;
  onAnadido: (texto: string) => void;
  addItem: ReturnType<typeof useCart>['addItem'];
}) {
  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Producto de la app para este artículo (el de la tienda o uno oculto con los datos de BC)
  useEffect(() => {
    let vigente = true;
    articuloParaCarrito(articulo.no).then((r) => {
      if (!vigente) return;
      if (r.error || !r.producto) {
        setError(r.error || 'No se pudo preparar el artículo.');
        return;
      }
      setPreparado(r.producto);
      setCantidad(String(r.producto.multiplo_compra > 1 ? r.producto.multiplo_compra : 1));
      setTimeout(() => inputRef.current?.select(), 0);
    });
    return () => {
      vigente = false;
    };
  }, [articulo.no]);

  const m = preparado?.multiplo_compra && preparado.multiplo_compra > 1 ? preparado.multiplo_compra : 1;
  const n = leerCantidad(cantidad);
  const errorCantidad = !preparado
    ? null
    : !esCantidadValida(n)
      ? 'Indica una cantidad válida (máx. 3 decimales).'
      : !esMultiploDe(n, m)
        ? `Debe ser múltiplo de ${m} (p. ej. ${ajustarAMultiplo(n, m)}).`
        : null;

  function anadir() {
    if (!preparado || errorCantidad) return;
    addItem(
      {
        producto_id: preparado.producto_id,
        nombre: preparado.nombre,
        imagen_url: preparado.imagen_url,
        multiplo_compra: preparado.multiplo_compra,
        unidad_medida: preparado.unidad_medida,
      },
      n
    );
    onAnadido(`Añadido al carrito: ${n} ${preparado.unidad_medida || 'ud.'} de ${articulo.no}`);
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onMouseDown={onCerrar}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6" onMouseDown={(e) => e.stopPropagation()}>
        <p className="font-mono text-sm text-[#2563EB] font-semibold">{articulo.no}</p>
        <h2 className="text-base font-semibold text-grafito mb-4">{articulo.descripcion}</h2>

        {!preparado && !error && <p className="text-sm text-slate">Preparando el artículo…</p>}
        {error && <p className="text-sm text-rojo">{error}</p>}

        {preparado && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              anadir();
            }}
          >
            <label className="block text-sm text-slate mb-1">¿Cuántas unidades quieres añadir al carrito?</label>
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="number"
                min={m}
                step={pasoCantidad(m)}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                className="input w-32 text-center"
              />
              <span className="text-sm text-slate">{preparado.unidad_medida || 'ud.'}</span>
            </div>
            {m > 1 && <p className="text-xs text-marca mt-1">Múltiplo de {m}</p>}
            {errorCantidad && <p className="text-xs text-rojo mt-1">{errorCantidad}</p>}

            <div className="flex justify-end gap-2 mt-6">
              <button type="button" onClick={onCerrar} className="text-sm text-slate hover:text-grafito px-4 py-2">
                Cancelar
              </button>
              <button type="submit" disabled={!!errorCantidad} className="btn-primary">
                Añadir al carrito
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
