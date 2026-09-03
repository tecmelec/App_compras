'use client';

import { Fragment, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { crearProducto, actualizarProducto, eliminarProducto } from '@/app/actions/catalogo';

type Producto = {
  id: string;
  nombre: string;
  descripcion: string | null;
  imagen_url: string | null;
  categoria: string | null;
  visible: boolean;
  precio: number;
};

export default function ProductosClient({ productos }: { productos: Producto[] }) {
  const [creando, setCreando] = useState(false);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div>
      <button onClick={() => setCreando(true)} className="btn-primary mb-4">
        + Nuevo producto
      </button>

      {creando && (
        <ProductoForm onCancel={() => setCreando(false)} onSuccess={() => { setCreando(false); router.refresh(); }} />
      )}

      <div className="bg-white border border-borde rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-fondo text-slate text-left">
            <tr>
              <th className="px-4 py-3"></th>
              <th className="px-4 py-3 font-medium">Nombre</th>
              <th className="px-4 py-3 font-medium">Categoría</th>
              <th className="px-4 py-3 font-medium">Precio</th>
              <th className="px-4 py-3 font-medium">Visible</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {productos.map((p) => (
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
                  <td className="px-4 py-3 text-slate">{p.categoria || '—'}</td>
                  <td className="px-4 py-3 font-mono text-grafito">{p.precio?.toFixed(2)} €</td>
                  <td className="px-4 py-3 text-slate">{p.visible ? 'Sí' : 'No'}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => setEditandoId(editandoId === p.id ? null : p.id)}
                      className="text-acero text-sm hover:underline"
                    >
                      {editandoId === p.id ? 'Cerrar' : 'Editar'}
                    </button>
                  </td>
                </tr>
                {editandoId === p.id && (
                  <tr>
                    <td colSpan={5} className="bg-fondo p-4">
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
            ))}
          </tbody>
        </table>
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
