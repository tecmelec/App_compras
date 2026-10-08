'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCart } from '@/context/CartContext';
import { confirmarListaFoto } from '@/app/actions/lista-foto';
import { ajustarAMultiplo, type LineaLista } from '@/lib/lista-foto-tipos';

type Decision = { producto_id: string | null; cantidad: number | null };

// Reduce la foto en el navegador (lado mayor 2000 px, JPEG) para subir rápido
// y no superar el límite de tamaño de Vercel.
async function reducirFoto(archivo: File): Promise<Blob> {
  const url = URL.createObjectURL(archivo);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('No se pudo leer la imagen. Prueba con una foto JPG o PNG.'));
      i.src = url;
    });
    const escala = Math.min(1, 2000 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * escala);
    canvas.height = Math.round(img.naturalHeight * escala);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la imagen.'))), 'image/jpeg', 0.85)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function CarritoDesdeFotoPage() {
  const router = useRouter();
  const { addItem, addListaFoto } = useCart();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [fase, setFase] = useState<'inicio' | 'analizando' | 'revision' | 'guardando'>('inicio');
  const [error, setError] = useState<string | null>(null);
  const [listaId, setListaId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaLista[]>([]);
  const [decisiones, setDecisiones] = useState<Record<number, Decision>>({});

  async function analizar(archivo: File) {
    setError(null);
    setFase('analizando');
    setPreview(URL.createObjectURL(archivo));
    try {
      const foto = await reducirFoto(archivo);
      const form = new FormData();
      form.append('foto', foto, 'lista.jpg');
      const r = await fetch('/api/carrito-foto', { method: 'POST', body: form });
      const datos = await r.json().catch(() => ({ error: `Error ${r.status} analizando la foto.` }));
      if (!r.ok || datos.error) throw new Error(datos.error || `Error ${r.status} analizando la foto.`);
      const ls: LineaLista[] = datos.lineas || [];
      if (ls.length === 0) throw new Error('No se ha encontrado ninguna lista de materiales legible en la foto.');
      setListaId(datos.id);
      setLineas(ls);
      setDecisiones(
        Object.fromEntries(
          ls.map((l) => [l.n, { producto_id: l.producto_propuesto_id, cantidad: l.cantidad_propuesta }])
        )
      );
      setFase('revision');
    } catch (e: any) {
      setError(e.message || 'No se pudo analizar la foto.');
      setFase('inicio');
    }
  }

  function cambiarProducto(linea: LineaLista, productoId: string | null) {
    const cand = linea.candidatos.find((c) => c.id === productoId);
    const base = productoId === linea.producto_propuesto_id ? linea.cantidad_producto : linea.cantidad_escrita;
    setDecisiones((prev) => ({
      ...prev,
      [linea.n]: {
        producto_id: productoId,
        cantidad: cand ? ajustarAMultiplo(base ?? cand.multiplo_compra, cand.multiplo_compra) : null,
      },
    }));
  }

  function errorCantidad(linea: LineaLista): string | null {
    const d = decisiones[linea.n];
    if (!d?.producto_id) return null;
    const cand = linea.candidatos.find((c) => c.id === d.producto_id);
    const m = cand?.multiplo_compra && cand.multiplo_compra > 1 ? cand.multiplo_compra : 1;
    if (!d.cantidad || d.cantidad <= 0) return 'Indica una cantidad.';
    if (d.cantidad % m !== 0) return `Debe ser múltiplo de ${m}.`;
    return null;
  }

  const seleccionadas = lineas.filter((l) => decisiones[l.n]?.producto_id);
  const hayErrores = useMemo(() => lineas.some((l) => errorCantidad(l)), [lineas, decisiones]); // eslint-disable-line react-hooks/exhaustive-deps

  async function anadirAlCarrito() {
    if (!listaId) return;
    setFase('guardando');
    setError(null);
    const resultado = await confirmarListaFoto(
      listaId,
      lineas.map((l) => ({ n: l.n, producto_id: decisiones[l.n]?.producto_id || null, cantidad: decisiones[l.n]?.cantidad || null }))
    );
    if (resultado.error) {
      setError(resultado.error);
      setFase('revision');
      return;
    }
    for (const l of seleccionadas) {
      const d = decisiones[l.n];
      const cand = l.candidatos.find((c) => c.id === d.producto_id)!;
      addItem(
        {
          producto_id: cand.id,
          nombre: cand.nombre,
          imagen_url: cand.imagen_url,
          multiplo_compra: cand.multiplo_compra,
          unidad_medida: cand.unidad_medida,
        },
        d.cantidad!
      );
    }
    addListaFoto(listaId);
    router.push('/carrito');
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <Link href="/carrito" className="text-sm text-slate hover:text-grafito">
        ← Volver al carrito
      </Link>
      <h1 className="text-2xl font-semibold text-grafito mt-2 mb-1">Crear carrito desde foto</h1>
      <p className="text-sm text-slate mb-6">
        Haz una foto a la lista de materiales escrita. Se buscará cada material en la tienda y podrás revisar la
        propuesta antes de añadirla al carrito. La foto y un informe de lo pedido irán en la solicitud.
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) analizar(f);
        }}
      />

      {error && (
        <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-4">{error}</p>
      )}

      {fase === 'inicio' && (
        <button onClick={() => inputRef.current?.click()} className="btn-primary">
          Hacer o elegir foto
        </button>
      )}

      {fase === 'analizando' && (
        <div className="flex items-center gap-4 bg-white border border-borde rounded-lg p-4">
          {preview && <img src={preview} alt="Lista" className="w-20 h-20 object-cover rounded-md" />}
          <div>
            <p className="text-sm font-medium text-grafito">Analizando la lista…</p>
            <p className="text-xs text-slate">Leyendo la foto y buscando cada material en la tienda. Puede tardar hasta un minuto.</p>
          </div>
        </div>
      )}

      {(fase === 'revision' || fase === 'guardando') && (
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {preview && (
            <a href={preview} target="_blank" rel="noopener noreferrer" className="lg:sticky lg:top-4 shrink-0">
              <img src={preview} alt="Lista en foto" className="w-full lg:w-64 rounded-lg border border-borde" />
              <span className="text-xs text-slate">Ver foto ampliada</span>
            </a>
          )}

          <div className="flex-1 min-w-0 w-full">
            <p className="text-sm text-slate mb-3">
              {seleccionadas.length} de {lineas.length} líneas con artículo de la tienda.
              {lineas.length - seleccionadas.length > 0 &&
                ` ${lineas.length - seleccionadas.length} sin artículo: quedarán como pendientes en el informe.`}
            </p>

            <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
              {lineas.map((l) => {
                const d = decisiones[l.n] || { producto_id: null, cantidad: null };
                const cand = l.candidatos.find((c) => c.id === d.producto_id) || null;
                const m = cand?.multiplo_compra && cand.multiplo_compra > 1 ? cand.multiplo_compra : 1;
                const err = errorCantidad(l);
                const esPropuesto = d.producto_id && d.producto_id === l.producto_propuesto_id;
                const ajustada =
                  cand && l.cantidad_producto != null && d.cantidad != null && d.cantidad !== l.cantidad_producto;
                return (
                  <div key={l.n} className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm text-grafito">
                          <span className="text-slate mr-1.5">{l.n}.</span>
                          <span className="italic">“{l.texto}”</span>
                        </p>
                        <p className="text-xs text-slate">
                          Escrito: {l.cantidad_escrita ?? 'sin cantidad'} {l.unidad_escrita || ''}
                        </p>
                      </div>
                      {!d.producto_id ? (
                        <span className="badge badge-cancelado shrink-0">No se añade</span>
                      ) : esPropuesto && l.confianza === 'baja' ? (
                        <span className="badge badge-pendiente shrink-0">Revisar</span>
                      ) : esPropuesto && l.confianza === 'media' ? (
                        <span className="badge badge-proceso shrink-0">Comprobar</span>
                      ) : (
                        <span className="badge badge-entregado shrink-0">OK</span>
                      )}
                    </div>

                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <div className="w-10 h-10 bg-fondo rounded-md overflow-hidden shrink-0 hidden sm:block">
                        {cand?.imagen_url && <img src={cand.imagen_url} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <select
                        value={d.producto_id || ''}
                        onChange={(e) => cambiarProducto(l, e.target.value || null)}
                        className="input flex-1 min-w-0"
                      >
                        <option value="">— No añadir (no está en la tienda) —</option>
                        {l.candidatos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                            {c.id === l.producto_propuesto_id ? '  ★ propuesto' : ''}
                          </option>
                        ))}
                      </select>
                      {cand && (
                        <div className="flex items-center gap-2 shrink-0">
                          <input
                            type="number"
                            min={m}
                            step={m}
                            value={d.cantidad ?? ''}
                            onChange={(e) =>
                              setDecisiones((prev) => ({
                                ...prev,
                                [l.n]: { ...d, cantidad: e.target.value === '' ? null : Number(e.target.value) },
                              }))
                            }
                            className="input w-24 text-center"
                          />
                          <span className="text-xs text-slate w-10">{cand.unidad_medida || 'ud.'}</span>
                        </div>
                      )}
                    </div>

                    {l.candidatos.length === 0 && (
                      <p className="text-xs text-slate">No se ha encontrado nada parecido en la tienda.</p>
                    )}
                    {cand && m > 1 && (
                      <p className="text-xs text-marca">
                        Múltiplo de {m}
                        {ajustada && esPropuesto && (
                          <span className="text-slate"> · ajustado de {l.cantidad_producto} a {d.cantidad}</span>
                        )}
                      </p>
                    )}
                    {esPropuesto && l.nota && <p className="text-xs text-slate">{l.nota}</p>}
                    {err && <p className="text-xs text-rojo">{err}</p>}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-3 mt-6">
              <button
                onClick={anadirAlCarrito}
                disabled={fase === 'guardando' || hayErrores || seleccionadas.length === 0}
                className="btn-primary"
              >
                {fase === 'guardando'
                  ? 'Añadiendo…'
                  : `Añadir ${seleccionadas.length} ${seleccionadas.length === 1 ? 'artículo' : 'artículos'} al carrito`}
              </button>
              <button
                onClick={() => inputRef.current?.click()}
                disabled={fase === 'guardando'}
                className="btn-secondary"
              >
                Usar otra foto
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
