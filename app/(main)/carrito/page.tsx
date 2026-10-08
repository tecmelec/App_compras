'use client';

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useCart } from '@/context/CartContext';
import { crearPedido } from '@/app/actions/pedidos';
import SolicitudModal from './SolicitudModal';
import { fotosListasCarrito } from '@/app/actions/lista-foto';

function validarCantidad(cantidad: number, multiplo: number): string | null {
  if (!Number.isFinite(cantidad) || cantidad <= 0) return 'Indica una cantidad válida.';
  if (multiplo > 1 && cantidad % multiplo !== 0) {
    return `Debe ser múltiplo de ${multiplo}.`;
  }
  return null;
}

export default function CarritoPage() {
  const { items, updateCantidad, removeItem, clear, listasFoto, removeListaFoto } = useCart();
  const [mostrarModal, setMostrarModal] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const erroresPorItem = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const item of items) {
      const multiplo = item.multiplo_compra && item.multiplo_compra > 1 ? item.multiplo_compra : 1;
      const mensaje = validarCantidad(item.cantidad, multiplo);
      if (mensaje) mapa.set(item.producto_id, mensaje);
    }
    return mapa;
  }, [items]);

  const hayErrores = erroresPorItem.size > 0;

  async function handleConfirmar(datos: {
    proyecto_id: string;
    nombre_contacto: string;
    telefono_contacto: string;
    direccion_entrega_id: string;
    fecha_requerida: string;
    comprador_id: string | null;
    seguir_pedido: boolean;
  }) {
    setEnviando(true);
    setError(null);

    const resultado = await crearPedido(items, { ...datos, lista_foto_ids: listasFoto });

    setEnviando(false);

    if (resultado.error) {
      setError(resultado.error);
      return;
    }

    setMostrarModal(false);
    clear();
    router.push(`/mis-pedidos?creado=${resultado.numeroApp}`);
  }

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold text-grafito">Carrito</h1>
        <Link href="/carrito/foto" className="btn-secondary inline-flex items-center gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
          Crear carrito desde foto
        </Link>
      </div>
      {listasFoto.length > 0 && items.length > 0 && <FotosDelCarrito ids={listasFoto} onQuitar={removeListaFoto} />}

      {items.length === 0 ? (
        <p className="text-slate text-sm">
          Tu carrito está vacío. Ve a la{' '}
          <a href="/tienda" className="text-marca underline">
            tienda
          </a>{' '}
          para añadir artículos.
        </p>
      ) : (
        <>
          <div className="bg-white border border-borde rounded-lg divide-y divide-borde">
            {items.map((item) => {
              const multiplo = item.multiplo_compra && item.multiplo_compra > 1 ? item.multiplo_compra : 1;
              const errorItem = erroresPorItem.get(item.producto_id);
              return (
                <div key={item.producto_id} className="flex items-center gap-4 p-4">
                  <div className="w-14 h-14 bg-fondo rounded-md relative shrink-0 overflow-hidden">
                    {item.imagen_url && (
                      <Image src={item.imagen_url} alt={item.nombre} fill className="object-cover" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-grafito truncate">{item.nombre}</p>
                    {multiplo > 1 && (
                      <p className="text-xs mt-0.5">
                        <span className="text-marca font-medium">Múltiplo de {multiplo}</span>{' '}
                        <span className="text-slate">
                          (pedido mínimo {multiplo} {item.unidad_medida || 'ud.'})
                        </span>
                      </p>
                    )}
                    {errorItem && <p className="text-xs text-rojo mt-0.5">{errorItem}</p>}
                  </div>
                  <div className="flex items-center shrink-0">
                    <button
                      type="button"
                      onClick={() => updateCantidad(item.producto_id, Math.max(multiplo, item.cantidad - multiplo))}
                      className="btn-stepper"
                      aria-label="Restar"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={multiplo}
                      step={multiplo}
                      value={item.cantidad}
                      onChange={(e) => updateCantidad(item.producto_id, Number(e.target.value))}
                      onFocus={(e) => e.target.select()}
                      className="w-16 h-9 text-center border-y border-borde text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      onClick={() => updateCantidad(item.producto_id, item.cantidad + multiplo)}
                      className="btn-stepper"
                      aria-label="Sumar"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.producto_id)}
                    className="text-sm text-rojo hover:underline shrink-0"
                  >
                    Quitar
                  </button>
                </div>
              );
            })}
          </div>

          {error && (
            <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mt-4">
              {error}
            </p>
          )}

          <button
            onClick={() => setMostrarModal(true)}
            disabled={hayErrores}
            title={hayErrores ? 'Corrige las cantidades marcadas antes de continuar.' : undefined}
            className="btn-primary mt-6 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            Solicitar materiales
          </button>
        </>
      )}

      {mostrarModal && (
        <SolicitudModal
          onCancel={() => setMostrarModal(false)}
          onConfirmar={handleConfirmar}
          enviando={enviando}
        />
      )}
    </div>
  );
}

// Fotos de listas de materiales vinculadas al carrito: se pueden ver o quitar antes
// de enviar la solicitud (los artículos del carrito no se tocan).
function FotosDelCarrito({ ids, onQuitar }: { ids: string[]; onQuitar: (id: string) => void }) {
  const [listas, setListas] = useState<{ id: string; url: string | null; lineas: number }[] | null>(null);
  const [confirmar, setConfirmar] = useState<string | null>(null);
  const clave = ids.join(',');

  useEffect(() => {
    let vigente = true;
    fotosListasCarrito(ids).then((r) => {
      if (!vigente) return;
      setListas(r.listas);
      if ('error' in r && r.error) return;
      // Ids que ya no existen (p. ej. lista borrada o ya enviada): se quitan del carrito.
      const encontrados = new Set(r.listas.map((l) => l.id));
      ids.filter((id) => !encontrados.has(id)).forEach(onQuitar);
    });
    return () => {
      vigente = false;
    };
  }, [clave]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!listas || listas.length === 0) return null;

  return (
    <div className="bg-white border border-borde rounded-lg p-3 mb-4 space-y-3">
      <p className="text-xs text-slate">
        Este carrito incluye artículos de {listas.length === 1 ? 'una lista en foto' : `${listas.length} listas en foto`}: la
        foto y su informe irán en la solicitud.
      </p>
      {listas.map((l) => (
        <div key={l.id} className="flex items-center gap-3">
          {l.url ? (
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <img src={l.url} alt="Lista en foto" className="w-14 h-14 object-cover rounded-md border border-borde" />
            </a>
          ) : (
            <div className="w-14 h-14 bg-fondo rounded-md shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm text-grafito">Lista en foto</p>
            <p className="text-xs text-slate">{l.lineas} {l.lineas === 1 ? 'línea' : 'líneas'} leídas</p>
          </div>
          {l.url && (
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="text-sm text-marca hover:underline shrink-0">
              Ver foto
            </a>
          )}
          {confirmar === l.id ? (
            <span className="text-sm shrink-0">
              <span className="text-grafito">¿Quitar la foto?</span>{' '}
              <button
                onClick={() => {
                  setConfirmar(null);
                  onQuitar(l.id);
                }}
                className="text-rojo font-medium hover:underline"
              >
                Sí
              </button>{' '}
              <button onClick={() => setConfirmar(null)} className="text-slate hover:underline">
                No
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmar(l.id)} className="text-sm text-rojo hover:underline shrink-0">
              Quitar foto
            </button>
          )}
        </div>
      ))}
      <p className="text-xs text-slate">Al quitar la foto, los artículos siguen en el carrito; solo se deja de adjuntar la foto y su informe.</p>
    </div>
  );
}
