'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  anadirArticulosTiendaProyecto,
  consumosTiendaProyecto,
  eliminarArticuloTiendaProyecto,
  proyectosTiendaProyecto,
  type ProyectoTienda,
} from '@/app/actions/tienda-proyecto';
import type { ConsumoArticulo, FueraPresupuesto } from '@/lib/tienda-proyecto';
import { useCart } from '@/context/CartContext';
import { esMultiploDe, formatoCantidad, leerCantidad, pasoCantidad } from '@/lib/cantidad';
import TarjetaConsumo, { BarraConsumo, BotonInfo, COLOR_TRAMO, EstadoConsumoBadge, unidadDe } from './TarjetaConsumo';
import { HistorialModal, Modal, ModificarModal } from './ModalesTiendaProyecto';
import AnadirArticulosModal from './AnadirArticulosModal';

type Filtro = 'todos' | 'alerta' | 'agotados';

export default function TiendaProyectoCliente() {
  const router = useRouter();
  const params = useSearchParams();
  const [proyectos, setProyectos] = useState<ProyectoTienda[] | null>(null);
  const [proyectoId, setProyectoId] = useState(params.get('p') || '');
  const [articulos, setArticulos] = useState<ConsumoArticulo[]>([]);
  const [fuera, setFuera] = useState<FueraPresupuesto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [vista, setVista] = useState<'tienda' | 'consumos'>(params.get('v') === 'consumos' ? 'consumos' : 'tienda');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [busqueda, setBusqueda] = useState('');
  const [anadiendo, setAnadiendo] = useState(false);
  const [historialDe, setHistorialDe] = useState<ConsumoArticulo | null>(null);
  const [modificando, setModificando] = useState<{ a: ConsumoArticulo; modo: 'cantidades' | 'ampliacion' } | null>(null);
  const [quitando, setQuitando] = useState<ConsumoArticulo | null>(null);

  useEffect(() => {
    proyectosTiendaProyecto().then((r) => {
      if (r.error) setError(r.error);
      setProyectos(r.proyectos || []);
    });
  }, []);

  const cargar = useCallback(async () => {
    if (!proyectoId) return;
    setCargando(true);
    setError(null);
    const r = await consumosTiendaProyecto(proyectoId);
    setCargando(false);
    if (r.error) {
      setError(r.error);
      return;
    }
    setArticulos(r.articulos || []);
    setFuera(r.fuera || []);
  }, [proyectoId]);

  useEffect(() => {
    setArticulos([]);
    setFuera([]);
    setMensaje(null);
    cargar();
  }, [cargar]);

  function cambiarUrl(p: string, v: string) {
    const q = new URLSearchParams();
    if (p) q.set('p', p);
    if (v === 'consumos') q.set('v', 'consumos');
    router.replace(`/tienda-proyecto${q.toString() ? `?${q}` : ''}`, { scroll: false });
  }

  function elegirProyecto(id: string) {
    setProyectoId(id);
    cambiarUrl(id, vista);
  }

  function cambiarVista(v: 'tienda' | 'consumos') {
    setVista(v);
    cambiarUrl(proyectoId, v);
  }

  const proyecto = proyectos?.find((p) => p.id === proyectoId) || null;
  const proyectoTexto = proyecto ? `${proyecto.bc_job_no} — ${proyecto.descripcion || ''}` : '';
  const enTienda = useMemo(() => new Set(articulos.map((a) => a.producto.id)), [articulos]);

  const resumen = useMemo(
    () => ({
      total: articulos.length,
      alerta: articulos.filter((a) => a.estado === 'alerta').length,
      agotados: articulos.filter((a) => a.estado === 'agotado' || a.estado === 'excedido').length,
    }),
    [articulos]
  );

  const visibles = articulos.filter((a) => {
    if (filtro === 'alerta' && a.estado !== 'alerta') return false;
    if (filtro === 'agotados' && a.estado !== 'agotado' && a.estado !== 'excedido') return false;
    const t = busqueda.trim().toLowerCase();
    if (!t) return true;
    return a.producto.nombre.toLowerCase().includes(t) || (a.producto.bc_item_no || '').toLowerCase().includes(t);
  });

  async function quitar(a: ConsumoArticulo) {
    const r = await eliminarArticuloTiendaProyecto(a.articulo_id);
    setQuitando(null);
    if (r.error) setError(r.error);
    else {
      setMensaje(`"${a.producto.nombre}" se ha quitado de la tienda del proyecto.`);
      cargar();
    }
  }

  return (
    <div className="p-4 sm:p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold text-grafito">Tienda por proyecto</h1>
      <p className="text-sm text-slate mb-5">Materiales autorizados por obra, con su cantidad máxima y lo consumido.</p>

      <SelectorProyecto proyectos={proyectos} valor={proyectoId} onElegir={elegirProyecto} />

      {proyecto && (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-5 mb-4">
          <div className="flex bg-fondo border border-borde rounded-lg p-1" role="tablist">
            {(['tienda', 'consumos'] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={vista === v}
                onClick={() => cambiarVista(v)}
                className={`text-sm rounded-md px-3 py-1.5 ${vista === v ? 'bg-white text-marca font-medium shadow-sm' : 'text-slate hover:text-grafito'}`}
              >
                {v === 'tienda' ? 'Artículos' : 'Ver consumos'}
                {v === 'consumos' && resumen.alerta + resumen.agotados > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-rojo text-white text-[11px] font-semibold">
                    {resumen.alerta + resumen.agotados}
                  </span>
                )}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAnadiendo(true)} className="btn-primary inline-flex items-center gap-1.5">
            <span className="text-lg leading-none">+</span> Añadir
          </button>
        </div>
      )}

      {error && <p className="text-sm text-rojo bg-[#F6E9E9] border border-[#E7C7C7] rounded-md px-3 py-2 mb-4">{error}</p>}
      {mensaje && (
        <p className="text-sm text-grafito bg-marcaClaro border border-[#C4DECD] rounded-md px-3 py-2 mb-4 whitespace-pre-line">{mensaje}</p>
      )}
      {cargando && articulos.length === 0 && <p className="text-sm text-slate">Cargando…</p>}

      {proyecto && !cargando && articulos.length === 0 && (vista === 'tienda' || fuera.length === 0) && !error && (
        <div className="border-2 border-dashed border-borde rounded-lg p-8 text-center">
          <p className="text-grafito font-medium">Este proyecto aún no tiene tienda</p>
          <p className="text-sm text-slate mt-1 mb-4">Añade los materiales autorizados de forma individual, con una lista, por referencia o desde un presupuesto.</p>
          <button type="button" onClick={() => setAnadiendo(true)} className="btn-primary">
            Añadir artículos
          </button>
        </div>
      )}

      {proyecto && (articulos.length > 0 || fuera.length > 0) && vista === 'consumos' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Contador valor={resumen.total} texto="artículos autorizados" activo={filtro === 'todos'} onClick={() => setFiltro('todos')} />
            <Contador valor={resumen.alerta} texto="por encima del 80 %" tono="ambar" activo={filtro === 'alerta'} onClick={() => setFiltro('alerta')} />
            <Contador valor={resumen.agotados} texto="agotados o excedidos" tono="rojo" activo={filtro === 'agotados'} onClick={() => setFiltro('agotados')} />
            <Contador
              valor={fuera.length}
              texto="fuera de presupuesto"
              tono={fuera.length > 0 ? 'ambar' : undefined}
              onClick={() => document.getElementById('fuera-presupuesto')?.scrollIntoView({ behavior: 'smooth' })}
            />
          </div>
          <LeyendaColores />
        </>
      )}

      {articulos.length > 0 && (
        <input
          className="input mb-3 max-w-sm"
          placeholder="Filtrar artículos…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      )}

      {vista === 'tienda' && articulos.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {visibles.map((a) => (
            <FichaArticulo
              key={a.articulo_id}
              a={a}
              onInfo={() => setHistorialDe(a)}
              onModificar={() => setModificando({ a, modo: 'cantidades' })}
              onAmpliar={() => setModificando({ a, modo: 'ampliacion' })}
              onQuitar={() => setQuitando(a)}
            />
          ))}
        </div>
      )}

      {vista === 'consumos' && (
        <>
          <div className="space-y-3">
            {visibles.map((a) => (
              <TarjetaConsumo
                key={a.articulo_id}
                a={a}
                onInfo={() => setHistorialDe(a)}
                onModificar={() => setModificando({ a, modo: 'cantidades' })}
                onAmpliar={() => setModificando({ a, modo: 'ampliacion' })}
              />
            ))}
            {articulos.length > 0 && visibles.length === 0 && <p className="text-sm text-slate">Ningún artículo con este filtro.</p>}
          </div>
          {proyecto && (
            <FueraDePresupuesto
              proyectoId={proyectoId}
              fuera={fuera}
              onAlta={(nombre) => {
                setMensaje(`"${nombre}" se ha dado de alta en la tienda del proyecto.`);
                cargar();
              }}
            />
          )}
        </>
      )}

      {anadiendo && proyecto && (
        <AnadirArticulosModal
          proyectoId={proyectoId}
          proyectoTexto={proyectoTexto}
          productosEnTienda={enTienda}
          onCerrar={() => setAnadiendo(false)}
          onAnadidos={(n, avisos) => {
            setAnadiendo(false);
            setMensaje(
              [`${n} ${n === 1 ? 'artículo añadido' : 'artículos añadidos'} a la tienda del proyecto.`, ...avisos].join('\n')
            );
            cargar();
            proyectosTiendaProyecto().then((r) => r.proyectos && setProyectos(r.proyectos));
          }}
        />
      )}
      {historialDe && <HistorialModal a={historialDe} onCerrar={() => setHistorialDe(null)} />}
      {modificando && (
        <ModificarModal
          a={modificando.a}
          modo={modificando.modo}
          onCerrar={() => setModificando(null)}
          onGuardado={() => {
            setModificando(null);
            cargar();
          }}
        />
      )}
      {quitando && (
        <Modal titulo="Quitar de la tienda del proyecto" subtitulo={quitando.producto.nombre} onCerrar={() => setQuitando(null)}>
          <p className="text-sm text-grafito mb-4">
            Se quitará el artículo y su historial de modificaciones. Lo ya solicitado no se borra: pasará a &quot;Fuera de presupuesto&quot;.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setQuitando(null)}>
              Cancelar
            </button>
            <button type="button" className="btn-rechazar" onClick={() => quitar(quitando)}>
              Quitar
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function SelectorProyecto({
  proyectos,
  valor,
  onElegir,
}: {
  proyectos: ProyectoTienda[] | null;
  valor: string;
  onElegir: (id: string) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fuera = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierto(false);
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  const elegido = proyectos?.find((p) => p.id === valor);
  const t = texto.trim().toLowerCase();
  const lista = (proyectos || [])
    .filter((p) => !t || p.bc_job_no.toLowerCase().includes(t) || (p.descripcion || '').toLowerCase().includes(t))
    .sort((a, b) => Number(b.num_articulos > 0) - Number(a.num_articulos > 0) || a.bc_job_no.localeCompare(b.bc_job_no));
  return (
    <div ref={ref} className="relative max-w-xl">
      <label className="block text-sm font-medium text-grafito mb-1">Proyecto</label>
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="input text-left flex items-center justify-between gap-2"
        aria-expanded={abierto}
      >
        <span className={elegido ? 'text-grafito truncate' : 'text-slate'}>
          {proyectos === null
            ? 'Cargando proyectos…'
            : elegido
              ? `${elegido.bc_job_no} — ${elegido.descripcion || ''}`
              : 'Selecciona un proyecto'}
        </span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate shrink-0" aria-hidden>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {abierto && proyectos && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-borde rounded-lg shadow-lg">
          <input
            autoFocus
            className="input border-0 border-b rounded-b-none"
            placeholder="Buscar por número o descripción…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="max-h-72 overflow-y-auto divide-y divide-borde">
            {lista.length === 0 && <p className="p-3 text-sm text-slate">Sin resultados.</p>}
            {lista.slice(0, 200).map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  onElegir(p.id);
                  setAbierto(false);
                  setTexto('');
                }}
                className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${p.id === valor ? 'bg-marcaClaro' : 'hover:bg-fondo'}`}
              >
                <span className="font-mono text-grafito shrink-0">{p.bc_job_no}</span>
                <span className="text-slate truncate flex-1">{p.descripcion}</span>
                {p.num_articulos > 0 && (
                  <span className="text-[11px] text-marca bg-marcaClaro rounded px-1.5 py-0.5 shrink-0">
                    {p.num_articulos} art.
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Contador({
  valor,
  texto,
  tono,
  activo,
  onClick,
}: {
  valor: number;
  texto: string;
  tono?: 'ambar' | 'rojo';
  activo?: boolean;
  onClick: () => void;
}) {
  const color = valor === 0 ? 'text-grafito' : tono === 'rojo' ? 'text-rojo' : tono === 'ambar' ? 'text-[#B7791F]' : 'text-grafito';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-left bg-white border rounded-lg px-4 py-3 ${activo ? 'border-marca ring-1 ring-marca' : 'border-borde hover:border-slate'}`}
    >
      <p className={`text-2xl font-semibold leading-none ${color}`}>{valor}</p>
      <p className="text-xs text-slate mt-1.5">{texto}</p>
    </button>
  );
}

function LeyendaColores() {
  const items = [
    { c: COLOR_TRAMO.inicial, t: 'Cantidad inicial' },
    { c: COLOR_TRAMO.recibido, t: 'Recibido' },
    { c: COLOR_TRAMO.pendiente, t: 'Pendiente de recibir' },
    { c: COLOR_TRAMO.libre, t: 'Pendiente de solicitar', borde: true },
    { c: COLOR_TRAMO.excedido, t: 'Por encima del límite' },
  ];
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate mb-4">
      {items.map((i) => (
        <span key={i.t} className="inline-flex items-center gap-1.5">
          <span className={`w-3 h-3 rounded-sm ${i.borde ? 'border border-borde' : ''}`} style={{ background: i.c }} />
          {i.t}
        </span>
      ))}
    </div>
  );
}

function FichaArticulo({
  a,
  onInfo,
  onModificar,
  onAmpliar,
  onQuitar,
}: {
  a: ConsumoArticulo;
  onInfo: () => void;
  onModificar: () => void;
  onAmpliar: () => void;
  onQuitar: () => void;
}) {
  const { addItem } = useCart();
  const u = unidadDe(a);
  const m = a.producto.multiplo_compra || 1;
  const [cantidad, setCantidad] = useState(String(m));
  const [anadido, setAnadido] = useState(false);
  const [menu, setMenu] = useState(false);
  const n = leerCantidad(cantidad);
  const errCantidad = !(n > 0) ? 'Indica una cantidad.' : !esMultiploDe(n, m) ? `Múltiplo de ${m}.` : null;
  const superaria = !errCantidad && n > a.disponible + 1e-9;

  function alCarrito() {
    if (errCantidad) return;
    addItem(
      {
        producto_id: a.producto.id,
        nombre: a.producto.nombre,
        imagen_url: a.producto.imagen_url,
        multiplo_compra: m,
        unidad_medida: a.producto.unidad_medida,
        ...(a.producto.visible ? {} : { desde_bc: true }),
      },
      n
    );
    setAnadido(true);
    setTimeout(() => setAnadido(false), 1800);
  }

  return (
    <div className="bg-white border border-borde rounded-lg p-4 flex flex-col">
      <div className="flex gap-3">
        <div className="w-14 h-14 rounded-md bg-fondo border border-borde flex items-center justify-center shrink-0 overflow-hidden">
          {a.producto.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={a.producto.imagen_url} alt="" className="w-full h-full object-contain" />
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#9AA1A9" strokeWidth="1.8" aria-hidden>
              <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4a2 2 0 0 0 1-1.7z" />
              <polyline points="3.3 7 12 12 20.7 7" />
              <line x1="12" y1="22" x2="12" y2="12" />
            </svg>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <p className="text-sm font-medium text-grafito leading-snug flex-1">{a.producto.nombre}</p>
            <BotonInfo onClick={onInfo} />
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenu((v) => !v)}
                className="w-6 h-6 rounded-full text-slate hover:bg-fondo inline-flex items-center justify-center"
                aria-label="Más opciones"
              >
                ⋮
              </button>
              {menu && (
                <div className="absolute right-0 z-20 mt-1 w-44 bg-white border border-borde rounded-lg shadow-lg py-1 text-sm" onMouseLeave={() => setMenu(false)}>
                  {[
                    { t: 'Modificar cantidades', f: onModificar },
                    { t: 'Ampliación', f: onAmpliar },
                    { t: 'Quitar de la tienda', f: onQuitar, rojo: true },
                  ].map((o) => (
                    <button
                      key={o.t}
                      type="button"
                      onClick={() => {
                        setMenu(false);
                        o.f();
                      }}
                      className={`w-full text-left px-3 py-1.5 hover:bg-fondo ${o.rojo ? 'text-rojo' : 'text-grafito'}`}
                    >
                      {o.t}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-slate font-mono">{a.producto.bc_item_no || '—'}</p>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-baseline justify-between text-xs mb-1">
          <span className="text-slate">
            Máx. {formatoCantidad(a.limite)} {u}
            {a.cantidad_ampliada > 0 && <span className="text-[#5B3E8C]"> (ampliado)</span>}
          </span>
          <span className={a.estado === 'ok' ? 'text-marca font-semibold' : a.estado === 'alerta' ? 'text-[#B7791F] font-semibold' : 'text-rojo font-semibold'}>
            {formatoCantidad(a.disponible)} {u} disponibles
          </span>
        </div>
        <BarraConsumo a={a} alta="h-1.5" />
        <div className="mt-1.5 min-h-[1.25rem]">
          <EstadoConsumoBadge a={a} />
        </div>
      </div>

      <div className="mt-auto pt-3 flex items-center gap-2">
        <input
          type="number"
          min={m}
          step={pasoCantidad(m)}
          value={cantidad}
          onChange={(e) => setCantidad(e.target.value)}
          className={`input w-20 py-1.5 text-center font-mono ${errCantidad ? 'border-rojo' : ''}`}
          aria-label="Cantidad"
        />
        <span className="text-xs text-slate w-6">{u}</span>
        <button type="button" onClick={alCarrito} disabled={!!errCantidad} className="btn-primary flex-1 text-sm py-1.5">
          {anadido ? '✓ Añadido' : 'Añadir al carrito'}
        </button>
      </div>
      {errCantidad && cantidad !== '' && <p className="text-[11px] text-rojo mt-1">{errCantidad}</p>}
      {superaria && (
        <p className="text-[11px] text-[#8A5A15] mt-1">Supera lo disponible: al solicitar se pedirá una ampliación.</p>
      )}
    </div>
  );
}

function FueraDePresupuesto({
  proyectoId,
  fuera,
  onAlta,
}: {
  proyectoId: string;
  fuera: FueraPresupuesto[];
  onAlta: (nombre: string) => void;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);
  const [maxima, setMaxima] = useState('');
  const [comentario, setComentario] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function darDeAlta(f: FueraPresupuesto) {
    setError(null);
    const m = leerCantidad(maxima);
    if (!(m > 0)) {
      setError('La cantidad máxima debe ser mayor que 0.');
      return;
    }
    setGuardando(true);
    const r = await anadirArticulosTiendaProyecto(proyectoId, [
      { producto_id: f.producto.id, cantidad_maxima: m, cantidad_inicial: 0, comentario: comentario || 'Alta desde "Fuera de presupuesto".' },
    ]);
    setGuardando(false);
    if (r.error || (r.avisos && r.avisos.length > 0 && !r.anadidos)) {
      setError(r.error || r.avisos!.join(' '));
      return;
    }
    setAbierto(null);
    onAlta(f.producto.nombre);
  }

  return (
    <section id="fuera-presupuesto" className="mt-8">
      <h2 className="text-lg font-semibold text-grafito">Fuera de presupuesto</h2>
      <p className="text-sm text-slate mb-3">Materiales pedidos para esta obra que no están en su tienda.</p>
      {fuera.length === 0 ? (
        <p className="text-sm text-slate bg-white border border-borde rounded-lg p-4">No hay materiales fuera de presupuesto.</p>
      ) : (
        <div className="bg-white border border-[#F2D9AE] rounded-lg divide-y divide-borde">
          {fuera.map((f) => {
            const u = f.producto.unidad_medida || 'ud.';
            const esteAbierto = abierto === f.producto.id;
            return (
              <div key={f.producto.id} className="p-4 text-sm">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="flex-1 min-w-[12rem]">
                    <p className="text-grafito font-medium">{f.producto.nombre}</p>
                    <p className="text-xs text-slate">
                      <span className="font-mono">{f.producto.bc_item_no || '—'}</span> · {f.solicitudes.join(', ')}
                    </p>
                  </div>
                  <div className="flex gap-4 text-xs">
                    <Dato valor={f.solicitado} u={u} texto="solicitados" />
                    <Dato valor={f.recibido} u={u} texto="recibidos" color={COLOR_TRAMO.recibido} />
                    <Dato valor={f.pendiente_recibir} u={u} texto="pendientes" color={COLOR_TRAMO.pendiente} />
                  </div>
                  {!esteAbierto && (
                    <button
                      type="button"
                      className="btn-secondary text-sm py-1.5"
                      onClick={() => {
                        setAbierto(f.producto.id);
                        setMaxima(String(f.solicitado));
                        setComentario('');
                        setError(null);
                      }}
                    >
                      Dar de alta en la tienda
                    </button>
                  )}
                </div>
                {esteAbierto && (
                  <div className="mt-3 bg-fondo border border-borde rounded-lg p-3">
                    <div className="flex flex-wrap items-end gap-3">
                      <label className="text-xs text-slate">
                        Cantidad máxima
                        <span className="flex items-center gap-1 mt-0.5">
                          <input type="number" min={0} step="any" value={maxima} onChange={(e) => setMaxima(e.target.value)} className="input w-28 py-1 font-mono" autoFocus />
                          <span>{u}</span>
                        </span>
                      </label>
                      <label className="text-xs text-slate flex-1 min-w-[12rem]">
                        Comentario (opcional)
                        <input value={comentario} onChange={(e) => setComentario(e.target.value)} maxLength={1000} className="input py-1 mt-0.5" />
                      </label>
                    </div>
                    <p className="text-[11px] text-slate mt-1.5">
                      Lo ya solicitado ({formatoCantidad(f.solicitado)} {u}) cuenta como consumo del artículo.
                    </p>
                    {error && <p className="text-xs text-rojo mt-1.5">{error}</p>}
                    <div className="flex justify-end gap-2 mt-2">
                      <button type="button" className="btn-secondary text-sm py-1.5" onClick={() => setAbierto(null)} disabled={guardando}>
                        Cancelar
                      </button>
                      <button type="button" className="btn-primary text-sm py-1.5" onClick={() => darDeAlta(f)} disabled={guardando}>
                        {guardando ? 'Guardando…' : 'Dar de alta'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

function Dato({ valor, u, texto, color }: { valor: number; u: string; texto: string; color?: string }) {
  return (
    <div className="text-right">
      <p className="font-semibold text-grafito" style={color && valor > 0 ? { color } : undefined}>
        {formatoCantidad(valor)} {u}
      </p>
      <p className="text-slate">{texto}</p>
    </div>
  );
}
