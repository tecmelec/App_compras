'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { aplicarPreciosPresupuesto } from '@/app/actions/presupuesto';
import ComboboxProveedor from '@/components/ComboboxProveedor';
import { reducirFoto } from '@/lib/reducir-foto';
import type { LineaPresupuesto, ProveedorPresupuesto, PropuestaPrecio } from '@/lib/presupuesto';

type Proveedor = { id: string; bc_proveedor_no: string; nombre: string | null };
type Item = { id: string; nombre: string; bc_item_no: string | null; cantidad: number };
type ItemActual = { id: string; precio: number };

const MAX_ARCHIVOS = 4;

function fmt(n: number | null) {
  return n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 5 });
}

// "Asignar precios desde presupuesto": adjuntar el presupuesto del proveedor (PDF o
// fotos, también pegando una captura con Ctrl+V), revisar qué línea del presupuesto
// corresponde a cada línea de la solicitud y aplicar sus precios (y el proveedor).
export default function PresupuestoBoton({
  pedidoId,
  proveedores,
  preciosActuales,
}: {
  pedidoId: string;
  proveedores: Proveedor[];
  preciosActuales: ItemActual[];
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAbierto(true)} className="btn-secondary">
        Asignar precios desde presupuesto
      </button>
      {abierto && (
        <Modal
          pedidoId={pedidoId}
          proveedores={proveedores}
          preciosActuales={preciosActuales}
          onCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}

function Modal({
  pedidoId,
  proveedores,
  preciosActuales,
  onCerrar,
}: {
  pedidoId: string;
  proveedores: Proveedor[];
  preciosActuales: ItemActual[];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [archivos, setArchivos] = useState<{ file: File; url: string }[]>([]);
  const [fase, setFase] = useState<'inicio' | 'analizando' | 'revision' | 'aplicando'>('inicio');
  const [error, setError] = useState<string | null>(null);
  const [presupuestoId, setPresupuestoId] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaPresupuesto[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [proveedorDetectado, setProveedorDetectado] = useState<ProveedorPresupuesto | null>(null);
  const [proveedorId, setProveedorId] = useState('');
  const [asignarProveedor, setAsignarProveedor] = useState(true);
  const [eleccion, setEleccion] = useState<Record<string, number | null>>({});
  const [porQue, setPorQue] = useState<Record<string, PropuestaPrecio['por']>>({});
  const [arrastrando, setArrastrando] = useState(false);

  // Arrastrar y soltar el PDF (o fotos) sobre la ventana
  function alArrastrar(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (fase === 'inicio' && Array.from(e.dataTransfer.types || []).includes('Files')) setArrastrando(true);
  }
  function alSoltar(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setArrastrando(false);
    if (fase !== 'inicio') return;
    const validos = Array.from(e.dataTransfer.files || []).filter(
      (f) => f.type === 'application/pdf' || f.type.startsWith('image/')
    );
    if (validos.length === 0) {
      setError('Solo se admiten archivos PDF o imágenes.');
      return;
    }
    anadir(validos);
  }

  function anadir(nuevos: File[]) {
    setArchivos((prev) => {
      const libres = MAX_ARCHIVOS - prev.length;
      if (libres <= 0) {
        setError(`Como máximo ${MAX_ARCHIVOS} archivos.`);
        return prev;
      }
      setError(null);
      return [...prev, ...nuevos.slice(0, libres).map((file) => ({ file, url: URL.createObjectURL(file) }))];
    });
  }

  // Pegar una captura con Ctrl+V
  useEffect(() => {
    if (fase !== 'inicio') return;
    function alPegar(e: ClipboardEvent) {
      const imgs = Array.from(e.clipboardData?.items || [])
        .filter((it) => it.kind === 'file' && it.type.startsWith('image/'))
        .map((it) => it.getAsFile())
        .filter(Boolean) as File[];
      if (imgs.length === 0) return;
      e.preventDefault();
      anadir(imgs.map((f, i) => new File([f], `captura-${Date.now()}-${i}.png`, { type: f.type })));
    }
    window.addEventListener('paste', alPegar);
    return () => window.removeEventListener('paste', alPegar);
  }, [fase]);

  async function analizar() {
    setFase('analizando');
    setError(null);
    try {
      const form = new FormData();
      form.append('pedidoId', pedidoId);
      for (const a of archivos) {
        if (a.file.type === 'application/pdf') form.append('archivo', a.file, a.file.name);
        else form.append('archivo', await reducirFoto(a.file, archivos.length > 1 ? 1600 : 2000, 0.85), a.file.name || 'foto.jpg');
      }
      const r = await fetch('/api/presupuesto', { method: 'POST', body: form });
      const datos = await r.json().catch(() => ({ error: `Error ${r.status} analizando el presupuesto.` }));
      if (!r.ok || datos.error) throw new Error(datos.error || `Error ${r.status} analizando el presupuesto.`);
      setPresupuestoId(datos.id);
      setLineas(datos.lineas || []);
      setItems(datos.items || []);
      setProveedorDetectado(datos.proveedor || null);
      setProveedorId(datos.proveedor?.proveedor_id || '');
      setAsignarProveedor(!!datos.proveedor?.proveedor_id);
      setEleccion(Object.fromEntries((datos.propuestas || []).map((p: PropuestaPrecio) => [p.item_id, p.linea_idx])));
      setPorQue(Object.fromEntries((datos.propuestas || []).map((p: PropuestaPrecio) => [p.item_id, p.por])));
      setFase('revision');
    } catch (e: any) {
      setError(e.message || 'No se pudo analizar el presupuesto.');
      setFase('inicio');
    }
  }

  const asignadas = items.filter((i) => {
    const idx = eleccion[i.id];
    const l = lineas.find((x) => x.idx === idx);
    return l && l.precio_unitario != null;
  });

  async function aplicar() {
    if (!presupuestoId) return;
    setFase('aplicando');
    setError(null);
    const r = await aplicarPreciosPresupuesto(
      presupuestoId,
      asignadas.map((i) => ({ item_id: i.id, linea_idx: eleccion[i.id] as number })),
      asignarProveedor && proveedorId ? proveedorId : null
    );
    if (r.error) {
      setError(r.error);
      setFase('revision');
      return;
    }
    router.refresh();
    onCerrar();
  }

  const precioActual = (id: string) => preciosActuales.find((p) => p.id === id)?.precio ?? null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onMouseDown={onCerrar}
      // Evita que el navegador abra el archivo si se suelta fuera de la ventana
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <div
        className={`relative bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto p-6 ${
          arrastrando ? 'ring-2 ring-marca ring-offset-2' : ''
        }`}
        onMouseDown={(e) => e.stopPropagation()}
        onDragEnter={alArrastrar}
        onDragOver={alArrastrar}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setArrastrando(false);
        }}
        onDrop={alSoltar}
      >
        {arrastrando && (
          <div className="absolute inset-0 z-10 rounded-xl bg-marcaClaro/80 border-2 border-dashed border-marca flex items-center justify-center pointer-events-none">
            <p className="text-marca font-medium">Suelta aquí el presupuesto (PDF o imágenes)</p>
          </div>
        )}
        <h2 className="text-lg font-semibold text-grafito mb-1">Asignar precios desde presupuesto</h2>
        <p className="text-sm text-slate mb-5">
          Adjunta el presupuesto del proveedor (PDF o fotos): arrástralo a esta ventana, pulsa &quot;Adjuntar&quot; o pega una
          captura con Ctrl+V. Se buscará cada
          artículo de la solicitud en el presupuesto y podrás revisar los precios antes de aplicarlos.
        </p>

        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            const fs = Array.from(e.target.files || []);
            e.target.value = '';
            anadir(fs);
          }}
        />

        {error && (
          <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-4">{error}</p>
        )}

        {fase === 'inicio' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              {archivos.map((a) => (
                <div key={a.url} className="relative">
                  {a.file.type === 'application/pdf' ? (
                    <div className="w-20 h-20 rounded-md border border-borde bg-fondo flex flex-col items-center justify-center text-[10px] text-slate p-1 text-center break-all">
                      <span className="font-semibold text-rojo text-xs">PDF</span>
                      {a.file.name.slice(0, 24)}
                    </div>
                  ) : (
                    <img src={a.url} alt="" className="w-20 h-20 object-cover rounded-md border border-borde" />
                  )}
                  <button
                    type="button"
                    onClick={() => setArchivos((prev) => prev.filter((x) => x.url !== a.url))}
                    className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-white border border-borde text-xs text-rojo leading-none"
                    aria-label="Quitar archivo"
                  >
                    ×
                  </button>
                </div>
              ))}
              {archivos.length < MAX_ARCHIVOS && (
                <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary">
                  + Adjuntar presupuesto
                </button>
              )}
              {archivos.length < MAX_ARCHIVOS && (
                <span className="text-xs text-slate">o arrastra aquí el PDF / pega una captura con Ctrl+V</span>
              )}
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onCerrar} className="text-sm text-slate hover:text-grafito px-4 py-2">
                Cancelar
              </button>
              <button type="button" onClick={analizar} disabled={archivos.length === 0} className="btn-primary">
                Analizar presupuesto
              </button>
            </div>
          </div>
        )}

        {fase === 'analizando' && (
          <p className="text-sm text-slate">Leyendo el presupuesto y buscando los artículos de la solicitud… Puede tardar hasta un minuto.</p>
        )}

        {(fase === 'revision' || fase === 'aplicando') && (
          <div className="space-y-5">
            <div className="bg-fondo border border-borde rounded-lg p-3 text-sm">
              <p className="text-slate mb-1">
                Proveedor del presupuesto:{' '}
                <span className="text-grafito font-medium">{proveedorDetectado?.nombre || 'no identificado'}</span>
                {proveedorDetectado?.cif && <span className="font-mono text-xs"> · {proveedorDetectado.cif}</span>}
              </p>
              <p className="text-xs text-slate mb-2">
                {proveedorDetectado?.bc_no
                  ? `En BC: ${proveedorDetectado.bc_no} — ${proveedorDetectado.bc_nombre} (identificado por ${proveedorDetectado.por === 'cif' ? 'CIF' : 'nombre'}).`
                  : 'No se ha encontrado en BC: elígelo si quieres asignarlo.'}
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <ComboboxProveedor
                  proveedores={
                    // Si el proveedor se acaba de dar de alta en la app al identificarlo, aún no está en la lista.
                    proveedorDetectado?.proveedor_id && !proveedores.some((x) => x.id === proveedorDetectado.proveedor_id)
                      ? [
                          ...proveedores,
                          {
                            id: proveedorDetectado.proveedor_id,
                            bc_proveedor_no: proveedorDetectado.bc_no || '',
                            nombre: proveedorDetectado.bc_nombre,
                          },
                        ]
                      : proveedores
                  }
                  value={proveedorId}
                  onChange={setProveedorId}
                  className="w-80 max-w-full"
                />
                <label className="flex items-center gap-2 text-sm text-grafito">
                  <input
                    type="checkbox"
                    checked={asignarProveedor}
                    onChange={(e) => setAsignarProveedor(e.target.checked)}
                    disabled={!proveedorId}
                  />
                  Asignar este proveedor a las líneas con precio del presupuesto
                </label>
              </div>
            </div>

            {items.length === 0 ? (
              <p className="text-sm text-slate">No hay líneas a las que asignar precio (todas tienen ya pedido de compra o están rechazadas).</p>
            ) : (
              <div className="border border-borde rounded-lg divide-y divide-borde">
                {items.map((i) => {
                  const idx = eleccion[i.id] ?? null;
                  const l = lineas.find((x) => x.idx === idx) || null;
                  const actual = precioActual(i.id);
                  return (
                    <div key={i.id} className="p-3 grid grid-cols-1 md:grid-cols-[1fr_1.4fr_auto] gap-2 md:items-center">
                      <div className="min-w-0">
                        <p className="text-sm text-grafito">{i.nombre}</p>
                        <p className="text-xs text-slate">
                          x{i.cantidad} · precio actual {fmt(actual)} €
                        </p>
                      </div>
                      <select
                        value={idx ?? ''}
                        onChange={(e) => {
                          setEleccion((prev) => ({ ...prev, [i.id]: e.target.value ? Number(e.target.value) : null }));
                          setPorQue((prev) => ({ ...prev, [i.id]: null }));
                        }}
                        className="input w-full min-w-0 text-sm"
                      >
                        <option value="">— Sin precio del presupuesto —</option>
                        {lineas.map((x) => (
                          <option key={x.idx} value={x.idx}>
                            {x.referencia ? `${x.referencia} · ` : ''}
                            {x.descripcion.slice(0, 60)} — {fmt(x.precio_unitario)} €
                          </option>
                        ))}
                      </select>
                      <div className="text-right text-sm font-mono whitespace-nowrap">
                        {l ? (
                          <>
                            <span className="text-grafito">{fmt(l.precio_unitario)} €</span>
                            <span className="block text-[11px] font-sans text-slate">
                              {idx === null
                                ? ''
                                : porQue[i.id] === 'referencia'
                                  ? 'por referencia'
                                  : porQue[i.id] === 'codigo'
                                    ? 'por código'
                                    : porQue[i.id] === 'ia'
                                      ? 'por descripción · revisar'
                                      : 'elegido a mano'}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate text-xs font-sans">sin cambio</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex justify-between items-center gap-2 flex-wrap">
              <p className="text-xs text-slate">
                {asignadas.length} de {items.length} líneas tomarán el precio del presupuesto. El presupuesto queda guardado
                en la solicitud.
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onCerrar} className="text-sm text-slate hover:text-grafito px-4 py-2">
                  Cerrar sin aplicar
                </button>
                <button
                  type="button"
                  onClick={aplicar}
                  disabled={fase === 'aplicando' || asignadas.length === 0}
                  className="btn-primary"
                >
                  {fase === 'aplicando' ? 'Aplicando…' : 'Aplicar precios'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
