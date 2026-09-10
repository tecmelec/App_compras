'use client';

import { Fragment, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { crearProducto, actualizarProducto, eliminarProducto } from '@/app/actions/catalogo';
import ColumnaFiltroOrden from '@/components/ColumnaFiltroOrden';

type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  categoria: string | null;
  visible: boolean;
  precio: number;
  unidad_medida: string | null;
  bc_item_no: string | null;
};

type Filtros = {
  nombre: string;
  bcItemNo: string;
  unidades: string[];
  categorias: string[];
  precioMin: string;
  precioMax: string;
  visibles: string[];
};

const FILTROS_VACIOS: Filtros = {
  nombre: '',
  bcItemNo: '',
  unidades: [],
  categorias: [],
  precioMin: '',
  precioMax: '',
  visibles: [],
};

type CampoOrden = 'nombre' | 'bc_item_no' | 'unidad_medida' | 'categoria' | 'precio' | 'visible';

export default function ProductosClient({ productos }: { productos: Producto[] }) {
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const router = useRouter();

  const [busqueda, setBusqueda] = useState('');
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VACIOS);
  const [columnaAbierta, setColumnaAbierta] = useState<string | null>(null);
  const [orden, setOrden] = useState<{ campo: CampoOrden; asc: boolean } | null>(null);

  const unidadesUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.unidad_medida).filter(Boolean))).sort() as string[],
    [productos]
  );
  const categoriasUnicas = useMemo(
    () => Array.from(new Set(productos.map((p) => p.categoria).filter(Boolean))).sort() as string[],
    [productos]
  );

  const hayFiltrosActivos = busqueda !== '' || JSON.stringify(filtros) !== JSON.stringify(FILTROS_VACIOS);

  function actualizar<K extends keyof Filtros>(campo: K, valor: Filtros[K]) {
    setFiltros((prev) => ({ ...prev, [campo]: valor }));
  }

  function alternarLista(campo: 'unidades' | 'categorias' | 'visibles', valor: string) {
    setFiltros((prev) => {
      const lista = prev[campo];
      const nueva = lista.includes(valor) ? lista.filter((v) => v !== valor) : [...lista, valor];
      return { ...prev, [campo]: nueva };
    });
  }

  function ordenarPor(campo: CampoOrden, asc: boolean) {
    setOrden({ campo, asc });
  }

  const filtrados = productos.filter((p) => {
    if (busqueda) {
      const texto = busqueda.toLowerCase();
      const campo = [p.nombre, p.descripcion, p.categoria, p.bc_item_no].filter(Boolean).join(' ').toLowerCase();
      if (!campo.includes(texto)) return false;
    }
    if (filtros.nombre && !p.nombre.toLowerCase().includes(filtros.nombre.toLowerCase())) return false;
    if (filtros.bcItemNo && !(p.bc_item_no || '').toLowerCase().includes(filtros.bcItemNo.toLowerCase())) return false;
    if (filtros.unidades.length > 0 && !filtros.unidades.includes(p.unidad_medida || '')) return false;
    if (filtros.categorias.length > 0 && !filtros.categorias.includes(p.categoria || '')) return false;
    if (filtros.precioMin && p.precio < Number(filtros.precioMin)) return false;
    if (filtros.precioMax && p.precio > Number(filtros.precioMax)) return false;
    if (filtros.visibles.length > 0 && !filtros.visibles.includes(p.visible ? 'Sí' : 'No')) return false;
    return true;
  });

  const ordenados = useMemo(() => {
    if (!orden) return filtrados;
    const copia = [...filtrados];
    copia.sort((a, b) => {
      let va: any = orden.campo === 'visible' ? (a.visible ? 1 : 0) : (a as any)[orden.campo] || '';
      let vb: any = orden.campo === 'visible' ? (b.visible ? 1 : 0) : (b as any)[orden.campo] || '';
      if (va < vb) return orden.asc ? -1 : 1;
      if (va > vb) return orden.asc ? 1 : -1;
      return 0;
    });
    return copia;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtrados, orden]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <button onClick={() => setCreando(true)} className="btn-primary">
          + Nuevo producto
        </button>
        <input
          className="input max-w-xs"
          placeholder="Buscar por nombre, referencia, categoría..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {hayFiltrosActivos && (
          <button
            onClick={() => {
              setBusqueda('');
              setFiltros(FILTROS_VACIOS);
            }}
            className="text-sm text-marca hover:underline"
          >
            ✕ Borrar filtros
          </button>
        )}
      </div>

      {creando && (
        <ProductoForm onCancel={() => setCreando(false)} onSuccess={() => { setCreando(false); router.refresh(); }} />
      )}

      {columnaAbierta && <div className="fixed inset-0 z-10" onClick={() => setColumnaAbierta(null)} />}

      <div className="bg-white border border-borde rounded-lg overflow-visible">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <th className="px-4 py-3"></th>
              <ColumnaFiltroOrden
                titulo="Nombre"
                campoOrden="nombre"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="nombre"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.nombre}
              >
                <input
                  className="input"
                  placeholder="Buscar..."
                  value={filtros.nombre}
                  onChange={(e) => actualizar('nombre', e.target.value)}
                  autoFocus
                />
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Nº BC"
                campoOrden="bc_item_no"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="bcItemNo"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.bcItemNo}
              >
                <input
                  className="input"
                  placeholder="Buscar..."
                  value={filtros.bcItemNo}
                  onChange={(e) => actualizar('bcItemNo', e.target.value)}
                  autoFocus
                />
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Unidad"
                campoOrden="unidad_medida"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="unidad"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={filtros.unidades.length > 0}
              >
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {unidadesUnicas.length === 0 ? (
                    <p className="text-sm text-slate">Sin opciones.</p>
                  ) : (
                    unidadesUnicas.map((u) => (
                      <label key={u} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filtros.unidades.includes(u)}
                          onChange={() => alternarLista('unidades', u)}
                        />
                        {u}
                      </label>
                    ))
                  )}
                </div>
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Categoría"
                campoOrden="categoria"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="categoria"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={filtros.categorias.length > 0}
              >
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {categoriasUnicas.length === 0 ? (
                    <p className="text-sm text-slate">Sin opciones.</p>
                  ) : (
                    categoriasUnicas.map((c) => (
                      <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={filtros.categorias.includes(c)}
                          onChange={() => alternarLista('categorias', c)}
                        />
                        {c}
                      </label>
                    ))
                  )}
                </div>
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Precio"
                campoOrden="precio"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="precio"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={!!filtros.precioMin || !!filtros.precioMax}
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
              </ColumnaFiltroOrden>

              <ColumnaFiltroOrden
                titulo="Visible"
                campoOrden="visible"
                ordenActual={orden}
                onOrdenar={ordenarPor}
                columnaId="visible"
                columnaAbierta={columnaAbierta}
                setColumnaAbierta={setColumnaAbierta}
                activoFiltro={filtros.visibles.length > 0}
              >
                <div className="space-y-1">
                  {['Sí', 'No'].map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filtros.visibles.includes(v)}
                        onChange={() => alternarLista('visibles', v)}
                      />
                      {v}
                    </label>
                  ))}
                </div>
              </ColumnaFiltroOrden>

              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {ordenados.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate text-sm">
                  No hay productos que coincidan con los filtros.
                </td>
              </tr>
            ) : (
              ordenados.map((p) => (
                <Fragment key={p.id}>
                  <tr className="hover:bg-fondo">
                    <td className="px-4 py-3">
                      <div className="w-10 h-10 bg-fondo rounded relative overflow-hidden">
                        {p.imagen_url && (
                          <Image src={p.imagen_url} alt={p.nombre} fill className="object-cover" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-grafito">{p.nombre}</td>
                    <td className="px-4 py-3 font-mono text-slate">{p.bc_item_no || '—'}</td>
                    <td className="px-4 py-3 text-slate">{p.unidad_medida || '—'}</td>
                    <td className="px-4 py-3 text-slate">{p.categoria || '—'}</td>
                    <td className="px-4 py-3 font-mono text-grafito">{p.precio?.toFixed(2)} €</td>
                    <td className="px-4 py-3 text-slate">{p.visible ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setEditandoId(editandoId === p.id ? null : p.id)}
                        className="text-marca text-sm hover:underline"
                      >
                        {editandoId === p.id ? 'Cerrar' : 'Editar'}
                      </button>
                    </td>
                  </tr>
                  {editandoId === p.id && (
                    <tr>
                      <td colSpan={8} className="bg-fondo p-4">
                        <ProductoForm
                          producto={p}
                          onCancel={() => setEditandoId(null)}
                          onSuccess={() => { setEditandoId(null); router.refresh(); }}
                          onDelete={() => { setEditandoId(null); router.refresh(); }}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}

function ProductoForm({
  producto,
  onCancel,
  onSuccess,
  onDelete,
}: {
  producto?: Producto;
  onCancel: () => void;
  onSuccess: () => void;
  onDelete?: () => void;
}) {
  const esEdicion = !!producto;

  const [nombre, setNombre] = useState(producto?.nombre || '');
  const [descripcion, setDescripcion] = useState(producto?.descripcion || '');
  const [categoria, setCategoria] = useState(producto?.categoria || '');
  const [precio, setPrecio] = useState(producto?.precio?.toString() || '0');
  const [visible, setVisible] = useState(producto?.visible ?? true);
  const [imagenUrl, setImagenUrl] = useState(producto?.imagen_url || '');
  const [subiendo, setSubiendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImagen(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    if (!archivo) return;

    setSubiendo(true);
    setError(null);

    const supabase = createClient();
    const nombreArchivo = `${Date.now()}-${archivo.name}`;

    const { error: errorSubida } = await supabase.storage
      .from('productos')
      .upload(nombreArchivo, archivo);

    if (errorSubida) {
      setError('No se pudo subir la imagen: ' + errorSubida.message);
      setSubiendo(false);
      return;
    }

    const { data } = supabase.storage.from('productos').getPublicUrl(nombreArchivo);
    setImagenUrl(data.publicUrl);
    setSubiendo(false);
  }

  async function handleGuardar() {
    setGuardando(true);
    setError(null);

    const datos = { nombre, descripcion, categoria, imagen_url: imagenUrl || null, precio: Number(precio) || 0 };

    const resultado = esEdicion
      ? await actualizarProducto(producto!.id, { ...datos, visible })
      : await crearProducto(datos);

    setGuardando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    onSuccess();
  }

  async function handleEliminar() {
    if (!producto) return;
    if (!confirm(`¿Eliminar "${producto.nombre}"? Esta acción no se puede deshacer.`)) return;
    await eliminarProducto(producto.id);
    onDelete?.();
  }

  return (
    <div className={esEdicion ? '' : 'bg-white border border-borde rounded-lg p-5 mb-4'}>
      <div className="grid grid-cols-2 gap-4 max-w-2xl">
        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Nombre</label>
          <input className="input" value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Categoría</label>
          <input className="input" value={categoria} onChange={(e) => setCategoria(e.target.value)} />
        </div>

        <div>
          <label className="block text-sm font-medium text-grafito mb-1">Precio (€)</label>
          <input
            className="input font-mono"
            type="number"
            step="0.01"
            min="0"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </div>

        <div className="col-span-2">
          <label className="block text-sm font-medium text-grafito mb-1">Descripción</label>
          <textarea
            className="input"
            rows={2}
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>

        {producto?.bc_item_no && (
          <p className="col-span-2 text-xs text-slate bg-fondo rounded-md px-3 py-2">
            Vinculado a Business Central (Nº {producto.bc_item_no}, unidad {producto.unidad_medida || '—'}).
            El nombre y el precio se actualizan solos en cada sincronización.
          </p>
        )}

        <div className="col-span-2">
          <label className="block text-sm font-medium text-grafito mb-1">Imagen</label>
          <div className="flex items-center gap-3">
            {imagenUrl && (
              <div className="w-14 h-14 bg-white border border-borde rounded relative overflow-hidden shrink-0">
                <Image src={imagenUrl} alt="" fill className="object-cover" />
              </div>
            )}
            <input type="file" accept="image/*" onChange={handleImagen} className="text-sm" />
            {subiendo && <span className="text-sm text-slate">Subiendo…</span>}
          </div>
        </div>

        {esEdicion && (
          <label className="flex items-center gap-2 text-sm text-grafito">
            <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
            Visible en la tienda
          </label>
        )}
      </div>

      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4 max-w-2xl">
          {error}
        </p>
      )}

      <div className="flex gap-2 mt-4">
        <button onClick={handleGuardar} disabled={guardando || subiendo} className="btn-primary">
          {guardando ? 'Guardando…' : 'Guardar'}
        </button>
        <button onClick={onCancel} className="btn-secondary">
          Cancelar
        </button>
        {esEdicion && (
          <button onClick={handleEliminar} className="text-rojo text-sm ml-auto hover:underline">
            Eliminar producto
          </button>
        )}
      </div>
    </div>
  );
}
