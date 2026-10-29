'use client';

import { useEffect, useRef, useState } from 'react';
import {
  anadirArticulosTiendaProyecto,
  buscarArticulosTiendaProyecto,
  type AltaArticuloTienda,
  type ResultadoBusquedaTienda,
} from '@/app/actions/tienda-proyecto';
import type { LineaLista } from '@/lib/lista-foto-tipos';
import { leerCantidad } from '@/lib/cantidad';
import { reducirFoto } from '@/lib/reducir-foto';
import { Modal } from './ModalesTiendaProyecto';

type Modo = 'individual' | 'lista' | 'referencias' | 'presupuesto';

const MODOS: { id: Modo; titulo: string; ayuda: string }[] = [
  { id: 'individual', titulo: 'Individual', ayuda: 'Busca en la tienda Tecmelec y en el catálogo completo de BC.' },
  { id: 'lista', titulo: 'Lista', ayuda: 'Escribe los materiales con su cantidad máxima, uno por línea (p. ej. "500 m cable RZ1-K 3G2,5").' },
  { id: 'referencias', titulo: 'Por referencia', ayuda: 'Pega referencias de fabricante con su cantidad, una por línea.' },
  { id: 'presupuesto', titulo: 'Presupuesto', ayuda: 'Adjunta el presupuesto (PDF o fotos). Las cantidades del presupuesto se proponen como cantidad máxima.' },
];

type Fila = { clave: string; producto_id: string | null; codigo_bc: string | null; nombre: string; unidad: string | null; maxima: string; inicial: string; incluir: boolean };

export default function AnadirArticulosModal({
  proyectoId,
  proyectoTexto,
  productosEnTienda,
  onCerrar,
  onAnadidos,
}: {
  proyectoId: string;
  proyectoTexto: string;
  productosEnTienda: Set<string>;
  onCerrar: () => void;
  onAnadidos: (n: number, avisos: string[]) => void;
}) {
  const [modo, setModo] = useState<Modo>('individual');
  const [filas, setFilas] = useState<Fila[]>([]);
  // Masivo: líneas analizadas (con sus candidatos) y la elección de cada una.
  const [lineas, setLineas] = useState<LineaLista[]>([]);
  const [texto, setTexto] = useState('');
  const [archivos, setArchivos] = useState<File[]>([]);
  const [analizando, setAnalizando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  function cambiarModo(m: Modo) {
    setModo(m);
    setError(null);
    setAviso(null);
    setLineas([]);
    setFilas([]);
    setTexto('');
    setArchivos([]);
  }

  function actualizarFila(clave: string, parcial: Partial<Fila>) {
    setFilas((prev) => prev.map((f) => (f.clave === clave ? { ...f, ...parcial } : f)));
  }

  async function analizar() {
    setError(null);
    setAviso(null);
    setAnalizando(true);
    try {
      const form = new FormData();
      form.append('modo', modo);
      if (texto.trim()) form.append('texto', texto);
      for (const a of archivos) {
        if (a.type === 'application/pdf') form.append('archivo', a, a.name);
        else form.append('archivo', await reducirFoto(a, archivos.length > 1 ? 1600 : undefined, archivos.length > 1 ? 0.8 : undefined), 'foto.jpg');
      }
      const r = await fetch('/api/tienda-proyecto/analizar', { method: 'POST', body: form });
      const datos = await r.json().catch(() => ({ error: `Error ${r.status} analizando.` }));
      if (!r.ok || datos.error) throw new Error(datos.error || `Error ${r.status} analizando.`);
      const ls: LineaLista[] = datos.lineas || [];
      if (ls.length === 0) throw new Error('No se ha encontrado ningún material.');
      setAviso(datos.aviso || null);
      setLineas(ls);
      setFilas(
        ls.map((l) => {
          const cand = l.candidatos.find((c) => c.id === l.producto_propuesto_id) || null;
          const cantidad = l.cantidad_producto ?? l.cantidad_escrita;
          return {
            clave: `l:${l.n}`,
            producto_id: cand?.id || null,
            codigo_bc: cand?.bc_item_no || null,
            nombre: cand?.nombre || '',
            unidad: cand?.unidad_medida || null,
            maxima: cantidad ? String(cantidad) : '',
            inicial: '0',
            incluir: !!cand && !productosEnTienda.has(cand.id),
          };
        })
      );
    } catch (e: any) {
      setError(e.message || 'No se pudo analizar.');
    } finally {
      setAnalizando(false);
    }
  }

  function elegirCandidato(l: LineaLista, productoId: string) {
    const cand = l.candidatos.find((c) => c.id === productoId) || null;
    actualizarFila(`l:${l.n}`, {
      producto_id: cand?.id || null,
      codigo_bc: cand?.bc_item_no || null,
      nombre: cand?.nombre || '',
      unidad: cand?.unidad_medida || null,
      incluir: !!cand && !productosEnTienda.has(cand.id),
    });
  }

  function errorFila(f: Fila): string | null {
    if (!f.incluir) return null;
    if (!f.producto_id && !f.codigo_bc) return 'Elige el artículo.';
    if (f.producto_id && productosEnTienda.has(f.producto_id)) return 'Ya está en la tienda del proyecto.';
    const m = leerCantidad(f.maxima);
    if (!(m > 0)) return 'La cantidad máxima debe ser mayor que 0.';
    const i = leerCantidad(f.inicial || '0');
    if (!(i >= 0)) return 'Cantidad inicial no válida.';
    return null;
  }

  const seleccionadas = filas.filter((f) => f.incluir);
  const hayErrores = seleccionadas.some((f) => errorFila(f));

  async function guardar() {
    setError(null);
    setGuardando(true);
    const items: AltaArticuloTienda[] = seleccionadas.map((f) => ({
      producto_id: f.producto_id,
      codigo_bc: f.producto_id ? null : f.codigo_bc,
      cantidad_maxima: leerCantidad(f.maxima),
      cantidad_inicial: leerCantidad(f.inicial || '0'),
    }));
    const r = await anadirArticulosTiendaProyecto(proyectoId, items);
    setGuardando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    onAnadidos(r.anadidos || 0, r.avisos || []);
  }

  const info = MODOS.find((m) => m.id === modo)!;

  return (
    <Modal titulo="Añadir artículos" subtitulo={proyectoTexto} onCerrar={onCerrar}>
      <div className="flex flex-wrap gap-1 bg-fondo border border-borde rounded-lg p-1 mb-3" role="tablist">
        {MODOS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={modo === m.id}
            onClick={() => cambiarModo(m.id)}
            className={`flex-1 min-w-[5.5rem] text-sm rounded-md px-2 py-1.5 ${
              modo === m.id ? 'bg-white text-marca font-medium shadow-sm' : 'text-slate hover:text-grafito'
            }`}
          >
            {m.titulo}
          </button>
        ))}
      </div>
      <p className="text-xs text-slate mb-3">{info.ayuda}</p>

      {modo === 'individual' && (
        <BuscadorIndividual
          productosEnTienda={productosEnTienda}
          yaElegidos={new Set(filas.map((f) => f.clave))}
          onElegir={(r) =>
            setFilas((prev) => [
              ...prev,
              { clave: r.clave, producto_id: r.producto_id, codigo_bc: r.codigo_bc, nombre: r.nombre, unidad: r.unidad, maxima: '', inicial: '0', incluir: true },
            ])
          }
        />
      )}

      {modo !== 'individual' && lineas.length === 0 && (
        <div className="space-y-2 mb-3">
          {modo === 'presupuesto' && (
            <label className="block border-2 border-dashed border-borde rounded-lg p-4 text-center text-sm text-slate cursor-pointer hover:border-marca">
              <input
                type="file"
                accept="application/pdf,image/*"
                multiple
                className="hidden"
                onChange={(e) => setArchivos(Array.from(e.target.files || []).slice(0, 4))}
              />
              {archivos.length > 0 ? archivos.map((a) => a.name).join(', ') : 'Elegir PDF o fotos del presupuesto'}
            </label>
          )}
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={modo === 'presupuesto' ? 3 : 8}
            maxLength={8000}
            className="input resize-y font-mono text-sm"
            placeholder={
              modo === 'lista'
                ? '500 m cable RZ1-K 3G2,5\n40 magnetotérmico 2P 16A\n20 luminaria LED estanca'
                : modo === 'referencias'
                  ? 'LVS03606  12\nA9F74216  40'
                  : 'Opcional: indicaciones o líneas adicionales'
            }
          />
          <button
            type="button"
            onClick={analizar}
            disabled={analizando || (!texto.trim() && archivos.length === 0)}
            className="btn-primary w-full"
          >
            {analizando ? 'Analizando… (puede tardar un minuto)' : 'Analizar'}
          </button>
        </div>
      )}

      {aviso && <p className="text-xs text-[#8A5A15] bg-[#FDF2E3] border border-[#F2D9AE] rounded-md px-3 py-2 mb-3">{aviso}</p>}

      {filas.length > 0 && (
        <div className="border border-borde rounded-lg divide-y divide-borde mb-3">
          {filas.map((f) => {
            const linea = f.clave.startsWith('l:') ? lineas.find((l) => `l:${l.n}` === f.clave) : null;
            const err = errorFila(f);
            const yaEsta = !!f.producto_id && productosEnTienda.has(f.producto_id);
            return (
              <div key={f.clave} className={`p-3 text-sm ${f.incluir ? '' : 'bg-fondo/60'}`}>
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={f.incluir}
                    disabled={yaEsta || (!f.producto_id && !f.codigo_bc)}
                    onChange={(e) => actualizarFila(f.clave, { incluir: e.target.checked })}
                    aria-label="Añadir este artículo"
                  />
                  <div className="flex-1 min-w-0">
                    {linea && <p className="text-xs text-slate mb-1 truncate" title={linea.texto}>“{linea.texto}”</p>}
                    {linea ? (
                      <select
                        value={f.producto_id || ''}
                        onChange={(e) => elegirCandidato(linea, e.target.value)}
                        className="input py-1 text-sm"
                      >
                        <option value="">— Sin artículo —</option>
                        {linea.candidatos.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.nombre}
                            {c.bc_item_no ? ` [${c.bc_item_no}]` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-grafito">
                        {f.nombre} <span className="font-mono text-xs text-slate">{f.codigo_bc}</span>
                      </p>
                    )}
                    {linea?.nota && <p className="text-[11px] text-slate mt-1">{linea.nota}</p>}
                    {yaEsta && <p className="text-[11px] text-slate mt-1">Ya está en la tienda del proyecto.</p>}
                    {f.incluir && (
                      <div className="flex flex-wrap gap-3 mt-2">
                        <label className="text-xs text-slate">
                          Cantidad máxima
                          <span className="flex items-center gap-1 mt-0.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={f.maxima}
                              onChange={(e) => actualizarFila(f.clave, { maxima: e.target.value })}
                              className="input w-24 py-1 font-mono"
                            />
                            <span>{f.unidad || 'ud.'}</span>
                          </span>
                        </label>
                        <label className="text-xs text-slate">
                          Cantidad inicial
                          <span className="flex items-center gap-1 mt-0.5">
                            <input
                              type="number"
                              min={0}
                              step="any"
                              value={f.inicial}
                              onChange={(e) => actualizarFila(f.clave, { inicial: e.target.value })}
                              className="input w-24 py-1 font-mono"
                            />
                            <span>{f.unidad || 'ud.'}</span>
                          </span>
                        </label>
                      </div>
                    )}
                    {err && <p className="text-xs text-rojo mt-1">{err}</p>}
                  </div>
                  {modo === 'individual' && (
                    <button
                      type="button"
                      onClick={() => setFilas((prev) => prev.filter((x) => x.clave !== f.clave))}
                      className="text-slate hover:text-rojo text-lg leading-none"
                      aria-label="Quitar"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-rojo mb-3">{error}</p>}

      <div className="flex flex-wrap justify-between gap-2">
        {modo !== 'individual' && lineas.length > 0 ? (
          <button type="button" onClick={() => cambiarModo(modo)} className="btn-secondary" disabled={guardando}>
            Volver a empezar
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="btn-secondary" disabled={guardando}>
            Cancelar
          </button>
          <button type="button" onClick={guardar} className="btn-primary" disabled={guardando || seleccionadas.length === 0 || hayErrores}>
            {guardando ? 'Añadiendo…' : `Añadir ${seleccionadas.length || ''}`.trim()}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function BuscadorIndividual({
  productosEnTienda,
  yaElegidos,
  onElegir,
}: {
  productosEnTienda: Set<string>;
  yaElegidos: Set<string>;
  onElegir: (r: ResultadoBusquedaTienda) => void;
}) {
  const [texto, setTexto] = useState('');
  const [resultados, setResultados] = useState<ResultadoBusquedaTienda[]>([]);
  const [buscando, setBuscando] = useState(false);
  const turno = useRef(0);
  useEffect(() => {
    const t = texto.trim();
    if (t.length < 2) {
      setResultados([]);
      return;
    }
    const mio = ++turno.current;
    const id = setTimeout(async () => {
      setBuscando(true);
      const r = await buscarArticulosTiendaProyecto(t);
      if (mio !== turno.current) return;
      setBuscando(false);
      setResultados(r.resultados || []);
    }, 350);
    return () => clearTimeout(id);
  }, [texto]);

  return (
    <div className="mb-3">
      <input
        className="input"
        placeholder="Buscar por descripción, código BC o referencia…"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        autoFocus
      />
      {buscando && <p className="text-xs text-slate mt-1">Buscando…</p>}
      {resultados.length > 0 && (
        <div className="border border-borde rounded-lg divide-y divide-borde max-h-56 overflow-y-auto mt-2">
          {resultados.map((r) => {
            const enTienda = !!r.producto_id && productosEnTienda.has(r.producto_id);
            const elegido = yaElegidos.has(r.clave);
            return (
              <button
                key={r.clave}
                type="button"
                disabled={enTienda || elegido}
                onClick={() => onElegir(r)}
                className="w-full text-left p-2.5 text-sm hover:bg-fondo disabled:opacity-50 disabled:hover:bg-transparent"
              >
                <span className="text-grafito">{r.nombre}</span>
                <span className="block text-xs text-slate">
                  <span className="font-mono">{r.codigo_bc || '—'}</span>
                  {r.origen === 'bc' ? ' · catálogo BC' : ' · tienda'}
                  {enTienda && ' · ya en la tienda del proyecto'}
                  {elegido && ' · elegido'}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
