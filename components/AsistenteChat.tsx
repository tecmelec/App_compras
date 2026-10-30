'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { preguntarAsistente, valorarRespuestaAsistente, type MensajeAsistente } from '@/app/actions/asistente';
import { visitasParaRol } from '@/lib/asistente/visitas';
import type { AccionAsistente, ArticuloPropuesto } from '@/lib/asistente/herramientas';
import { useCart } from '@/context/CartContext';
import { esCantidadValida, esMultiploDe, leerCantidad, pasoCantidad } from '@/lib/cantidad';
import { reducirFoto } from '@/lib/reducir-foto';
import type { AdjuntoAsistente } from '@/lib/asistente/adjuntos';

// Asistente de la app (fase 1). Se abre con el botón flotante "?" o desde el recuadro
// "¿Necesitas ayuda?" del menú (evento "abrir-asistente").
type Msg = MensajeAsistente & {
  id?: string | null;
  valoracion?: 1 | -1;
  acciones?: AccionAsistente[];
  // Miniaturas (URL locales) y nombres de los archivos adjuntos, solo para mostrarlos.
  fotos?: string[];
  pdfs?: string[];
};

const MAX_ADJUNTOS = 4;

const SUGERENCIAS: Record<string, string[]> = {
  usuario: ['Necesito 200 m de hilo de 1,5 azul', '¿Cómo van mis solicitudes?', 'No encuentro un artículo en la tienda'],
  responsable: ['Necesito 200 m de hilo de 1,5 azul', '¿Cómo van mis solicitudes?', '¿Cómo apruebo una solicitud?'],
  comprador: ['¿Cómo tramito una solicitud?', '¿Cómo pido ofertas a varios proveedores?', '¿Cómo envío el pedido al proveedor?'],
  admin: ['Quiero hacer una solicitud de material', '¿Cómo apruebo una solicitud?', '¿Cómo tramito una solicitud?'],
  integral: ['Necesito 200 m de hilo de 1,5 azul', '¿Cómo apruebo una solicitud?', '¿Cómo tramito una solicitud?'],
};

// Burbuja de la mascota según la pantalla (al pulsarla abre el chat con esa pregunta).
function pistaParaRuta(ruta: string, rol: string): { texto: string; pregunta: string } {
  if (ruta.startsWith('/carrito/foto')) return { texto: '¿Te explico cómo crear el carrito con una foto?', pregunta: '¿Cómo creo el carrito desde una foto?' };
  if (ruta.startsWith('/carrito')) return { texto: '¿Te ayudo a enviar la solicitud?', pregunta: '¿Cómo envío la solicitud de material?' };
  if (ruta.startsWith('/tienda')) return { texto: '¿Buscas algún material? Te ayudo', pregunta: 'Quiero hacer una solicitud de material' };
  if (ruta.startsWith('/lineas-compras')) return { texto: '¿Te explico qué significa cada columna?', pregunta: '¿Qué significa cada columna de Líns. compras?' };
  if (ruta.startsWith('/mis-pedidos')) return { texto: '¿Quieres saber cómo va tu solicitud?', pregunta: '¿Cómo sé cuándo llega mi material?' };
  if (ruta.startsWith('/responsable') && rol !== 'usuario') return { texto: '¿Te explico cómo aprobar?', pregunta: '¿Cómo apruebo una solicitud?' };
  if (ruta.startsWith('/comprador') && ['comprador', 'admin', 'integral'].includes(rol))
    return { texto: '¿Te ayudo a tramitar la solicitud?', pregunta: '¿Cómo tramito una solicitud?' };
  return { texto: '¡Hola! ¿Te ayudo con algo?', pregunta: '' };
}

// Tarjeta "Añadir al carrito" propuesta por el asistente: el usuario revisa y confirma.
function PropuestaCarrito({ items }: { items: ArticuloPropuesto[] }) {
  const { addItem } = useCart();
  const [cantidades, setCantidades] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.producto_id, String(i.cantidad)]))
  );
  const [elegidos, setElegidos] = useState<Set<string>>(new Set(items.map((i) => i.producto_id)));
  const [hecho, setHecho] = useState(false);
  const error = (i: ArticuloPropuesto) => {
    const n = leerCantidad(cantidades[i.producto_id]);
    if (!esCantidadValida(n)) return 'Cantidad no válida';
    if (!esMultiploDe(n, i.multiplo_compra)) return `Múltiplo de ${i.multiplo_compra}`;
    return null;
  };
  const hayError = items.some((i) => elegidos.has(i.producto_id) && error(i));
  if (hecho) {
    return (
      <div className="mt-2 rounded-lg border border-[#A7E3C4] bg-[#F3FBF6] px-3 py-2 text-xs text-[#047857]">
        ✓ Añadido al carrito. Cuando lo tengas todo, entra en el carrito y pulsa &quot;Solicitar materiales&quot;.{' '}
        <Link href="/carrito" className="underline font-medium">
          Ir al carrito
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-2 rounded-lg border border-borde bg-white p-2.5">
      <p className="text-xs font-semibold text-grafito mb-1.5">Añadir al carrito</p>
      <ul className="space-y-1.5">
        {items.map((i) => {
          const e = elegidos.has(i.producto_id) ? error(i) : null;
          return (
            <li key={i.producto_id} className="text-xs border-b border-borde last:border-b-0 pb-1.5 last:pb-0">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 shrink-0"
                  checked={elegidos.has(i.producto_id)}
                  onChange={(ev) =>
                    setElegidos((prev) => {
                      const n = new Set(prev);
                      if (ev.target.checked) n.add(i.producto_id);
                      else n.delete(i.producto_id);
                      return n;
                    })
                  }
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-grafito leading-snug break-words">{i.nombre}</span>
                  <span className="block text-slate">
                    {i.ref || ''}
                    {i.multiplo_compra > 1 ? ` · múltiplo de ${i.multiplo_compra}` : ''}
                    {i.desde_bc ? ' · catálogo BC (requiere aprobación)' : ''}
                  </span>
                </span>
              </label>
              <div className="flex items-center justify-end gap-1.5 mt-1">
                <span className="text-slate">Cantidad</span>
                <input
                  type="number"
                  min={0}
                  step={pasoCantidad(i.multiplo_compra)}
                  value={cantidades[i.producto_id]}
                  onChange={(ev) => setCantidades((prev) => ({ ...prev, [i.producto_id]: ev.target.value }))}
                  style={{ width: '5.5rem' }}
                  className="border border-borde rounded-md px-2 py-1 text-xs text-right font-mono focus:outline-none focus:border-marca"
                />
                <span className="text-slate">{i.unidad_medida || 'ud'}</span>
              </div>
              {e && <span className="block text-right text-rojo mt-0.5">{e}</span>}
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        disabled={elegidos.size === 0 || hayError}
        onClick={() => {
          for (const i of items) {
            if (!elegidos.has(i.producto_id)) continue;
            addItem(
              {
                producto_id: i.producto_id,
                nombre: i.nombre,
                imagen_url: i.imagen_url,
                multiplo_compra: i.multiplo_compra,
                unidad_medida: i.unidad_medida,
                ...(i.desde_bc ? { desde_bc: true } : {}),
              },
              leerCantidad(cantidades[i.producto_id])
            );
          }
          setHecho(true);
        }}
        className="btn-primary w-full mt-2 text-xs py-1.5 disabled:opacity-60"
      >
        Añadir {elegidos.size} al carrito
      </button>
    </div>
  );
}

function Mascota({ tam, className = '' }: { tam: number; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={tam > 64 ? '/asistente/mascota-192.png' : '/asistente/mascota-96.png'}
      alt=""
      width={tam}
      height={tam}
      className={`rounded-full bg-white object-cover ${className}`}
      draggable={false}
    />
  );
}

// Texto con botones [[Etiqueta|/ruta]] y **negritas**.
function Contenido({ texto, onIr, onVisita }: { texto: string; onIr: () => void; onVisita: (id: string) => void }) {
  // Agrupa las líneas de tabla markdown (| a | b |) para pintarlas como tabla.
  const bloques: ({ tipo: 'linea'; texto: string } | { tipo: 'tabla'; filas: string[][] })[] = [];
  for (const l of texto.split('\n')) {
    const t = l.trim();
    if (/^\|.*\|$/.test(t)) {
      if (/^\|[\s:|-]+\|$/.test(t)) continue; // separador |---|---|
      const celdas = t.slice(1, -1).split('|').map((c) => c.trim());
      const ultimo = bloques[bloques.length - 1];
      if (ultimo && ultimo.tipo === 'tabla') ultimo.filas.push(celdas);
      else bloques.push({ tipo: 'tabla', filas: [celdas] });
    } else bloques.push({ tipo: 'linea', texto: l });
  }
  const enLinea = (t: string, clave: string) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((x, j) =>
      /^\*\*[^*]+\*\*$/.test(x) ? <strong key={`${clave}-${j}`}>{x.slice(2, -2)}</strong> : <span key={`${clave}-${j}`}>{x}</span>
    );
  return (
    <div className="space-y-1">
      {bloques.map((b, i) => {
        if (b.tipo === 'tabla') {
          const [cab, ...resto] = b.filas;
          return (
            <div key={i} className="overflow-x-auto my-1 -mx-1">
              <table className="text-[0.92em] border-collapse min-w-full">
                <thead>
                  <tr>
                    {cab.map((c, k) => (
                      <th key={k} className="text-left font-semibold text-grafito border-b border-borde px-1.5 py-1 whitespace-nowrap">
                        {enLinea(c, `h${i}${k}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {resto.map((f, k) => (
                    <tr key={k} className="align-top">
                      {f.map((c, j) => (
                        <td key={j} className="border-b border-borde/70 px-1.5 py-1">
                          {enLinea(c, `c${i}${k}${j}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const titulo = b.texto.match(/^\s*#{1,4}\s+(.*)$/);
        if (titulo) return <p key={i} className="font-semibold text-grafito mt-1">{enLinea(titulo[1], `t${i}`)}</p>;
        const linea = b.texto;
        const partes = linea.split(/(\[\[[^|\]]+\|[^\]]+\]\])/g).filter((p) => p !== '');
        if (partes.length === 0) return <div key={i} className="h-1.5" />;
        return (
          <p key={i} className="leading-snug">
            {partes.map((p, k) => {
              const m = p.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
              if (m && m[2].trim().startsWith('tour:')) {
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => onVisita(m[2].trim().slice(5))}
                    className="inline-flex items-center gap-1 my-0.5 mr-1 px-2.5 py-1 rounded-full bg-[#0F3D2A] text-white text-xs font-medium hover:bg-black"
                  >
                    {m[1].trim()}
                  </button>
                );
              }
              if (m) {
                return (
                  <Link
                    key={k}
                    href={m[2].trim()}
                    onClick={onIr}
                    className="inline-flex items-center gap-1 my-0.5 mr-1 px-2.5 py-1 rounded-full bg-marca text-white text-xs font-medium hover:bg-[#12703D]"
                  >
                    {m[1].trim()} →
                  </Link>
                );
              }
              return p.split(/(\*\*[^*]+\*\*)/g).map((t, j) =>
                /^\*\*[^*]+\*\*$/.test(t) ? <strong key={`${k}-${j}`}>{t.slice(2, -2)}</strong> : <span key={`${k}-${j}`}>{t}</span>
              );
            })}
          </p>
        );
      })}
    </div>
  );
}

export default function AsistenteChat({ rol, nombre }: { rol: string; nombre: string }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState<Msg[]>([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [adjuntos, setAdjuntos] = useState<File[]>([]);
  const archivoRef = useRef<HTMLInputElement>(null);
  function elegirAdjuntos(lista: FileList | null) {
    const validos = Array.from(lista || []).filter((f) => /^image\//.test(f.type) || f.type === 'application/pdf');
    if (validos.length < (lista?.length || 0)) setError('Solo se pueden adjuntar fotos o PDF.');
    setAdjuntos((prev) => {
      const todos = [...prev, ...validos];
      if (todos.length > MAX_ADJUNTOS) setError(`Como máximo ${MAX_ADJUNTOS} archivos por mensaje.`);
      return todos.slice(0, MAX_ADJUNTOS);
    });
  }
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const [burbuja, setBurbuja] = useState(false);
  // Tamaño de la ventana y del texto, recordados en este navegador.
  const [grande, setGrande] = useState(false);
  const [letra, setLetra] = useState(0); // 0 normal, 1 grande, 2 muy grande
  useEffect(() => {
    try {
      setGrande(window.localStorage.getItem('asistente_grande') === '1');
      setLetra(Math.min(2, Math.max(0, Number(window.localStorage.getItem('asistente_letra') || 0))));
    } catch {
      /* sin almacenamiento */
    }
  }, []);
  const cambiarGrande = (v: boolean) => {
    setGrande(v);
    try {
      window.localStorage.setItem('asistente_grande', v ? '1' : '0');
    } catch {
      /* nada */
    }
  };
  const cambiarLetra = (v: number) => {
    const n = Math.min(2, Math.max(0, v));
    setLetra(n);
    try {
      window.localStorage.setItem('asistente_letra', String(n));
    } catch {
      /* nada */
    }
  };
  const pista = pistaParaRuta(ruta || '', rol);

  // La mascota saluda con una burbuja la primera vez en cada pantalla de la sesión.
  useEffect(() => {
    setBurbuja(false);
    if (abierto) return;
    let clave = '';
    try {
      clave = `asistente_burbuja_${(ruta || '').split('/').slice(0, 3).join('/')}`;
      if (window.sessionStorage.getItem(clave)) return;
    } catch {
      /* sin almacenamiento: se muestra igual */
    }
    const mostrar = setTimeout(() => {
      setBurbuja(true);
      try {
        if (clave) window.sessionStorage.setItem(clave, '1');
      } catch {
        /* nada */
      }
    }, 2500);
    const ocultar = setTimeout(() => setBurbuja(false), 11000);
    return () => {
      clearTimeout(mostrar);
      clearTimeout(ocultar);
    };
  }, [ruta, abierto]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const abrir = () => setAbierto(true);
    window.addEventListener('abrir-asistente', abrir);
    return () => window.removeEventListener('abrir-asistente', abrir);
  }, []);
  useEffect(() => {
    if (abierto) setTimeout(() => inputRef.current?.focus(), 50);
  }, [abierto]);
  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [mensajes, pensando]);

  async function enviar(pregunta?: string) {
    const t = (pregunta ?? texto).trim();
    const conAdjuntos = pregunta === undefined ? adjuntos : [];
    if ((!t && conAdjuntos.length === 0) || pensando) return;
    const nuevo: Msg = {
      rol: 'user',
      texto: t,
      fotos: conAdjuntos.filter((a) => a.type !== 'application/pdf').map((a) => URL.createObjectURL(a)),
      pdfs: conAdjuntos.filter((a) => a.type === 'application/pdf').map((a) => a.name),
    };
    let nuevos: Msg[] = [...mensajes, nuevo];
    setMensajes(nuevos);
    setTexto('');
    setAdjuntos([]);
    setError(null);
    setPensando(true);

    // 1. Adjuntos: se analizan aparte (petición propia por el límite de tiempo del servidor).
    if (conAdjuntos.length > 0) {
      setLeyendo(true);
      try {
        const form = new FormData();
        const varias = conAdjuntos.length > 1;
        for (const a of conAdjuntos) {
          if (a.type === 'application/pdf') form.append('archivo', a, a.name);
          else form.append('archivo', await reducirFoto(a, varias ? 1600 : 2000, varias ? 0.8 : 0.85), 'foto.jpg');
        }
        const resp = await fetch('/api/asistente/adjuntos', { method: 'POST', body: form });
        const datos = await resp.json().catch(() => ({ error: `Error ${resp.status} leyendo el adjunto.` }));
        if (!resp.ok || datos.error) throw new Error(datos.error || `Error ${resp.status} leyendo el adjunto.`);
        const adjunto = datos.adjunto as AdjuntoAsistente;
        nuevos = nuevos.map((m) => (m === nuevo ? { ...m, adjunto } : m));
        setMensajes(nuevos);
      } catch (e: any) {
        setLeyendo(false);
        setPensando(false);
        setError(e?.message || 'No se ha podido leer el adjunto.');
        return;
      }
      setLeyendo(false);
    }

    const r = await preguntarAsistente(
      nuevos.map(({ rol, texto, adjunto }) => ({ rol, texto, ...(adjunto ? { adjunto } : {}) })),
      ruta || ''
    );
    setPensando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    const d = r as { respuesta: string; id: string | null; acciones?: AccionAsistente[] };
    setMensajes((prev) => [...prev, { rol: 'assistant', texto: d.respuesta, id: d.id, acciones: d.acciones || [] }]);
  }

  function iniciarVisita(id: string) {
    setAbierto(false);
    window.dispatchEvent(new CustomEvent('iniciar-visita', { detail: { id } }));
  }

  async function valorar(k: number, v: 1 | -1) {
    const m = mensajes[k];
    if (!m.id || m.valoracion) return;
    setMensajes((prev) => prev.map((x, i) => (i === k ? { ...x, valoracion: v } : x)));
    await valorarRespuestaAsistente(m.id, v);
  }

  const primerNombre = (nombre || '').split(' ')[0];

  return (
    <>
      {!abierto && (
        <div className="fixed bottom-4 right-4 z-40 flex items-end gap-2 print:hidden">
          {burbuja && (
            <div className="asistente-aparecer relative mb-3 max-w-[220px] bg-white border border-borde shadow-lg rounded-2xl rounded-br-sm pl-3 pr-6 py-2 text-sm text-grafito">
              <button
                type="button"
                onClick={() => {
                  setBurbuja(false);
                  setAbierto(true);
                  if (pista.pregunta) enviar(pista.pregunta);
                }}
                className="text-left hover:text-marca"
              >
                {pista.texto}
              </button>
              <button
                type="button"
                onClick={() => setBurbuja(false)}
                className="absolute top-1 right-1.5 text-slate hover:text-grafito text-sm leading-none"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setBurbuja(false);
              setAbierto(true);
            }}
            className="asistente-flotar rounded-full shadow-xl ring-2 ring-white bg-white"
            title="Asistente: pregúntame cómo usar la app"
            aria-label="Abrir el asistente"
          >
            <Mascota tam={64} />
          </button>
        </div>
      )}

      {abierto && (
        <div
          className={`fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-4 sm:right-4 bg-white sm:rounded-xl rounded-t-xl shadow-2xl border border-borde flex flex-col print:hidden ${
            grande ? 'h-[92vh] sm:w-[min(720px,calc(100vw-2rem))] sm:h-[calc(100vh-2rem)]' : 'h-[75vh] sm:w-[380px] sm:h-[560px]'
          }`}
        >
          <div className="flex items-center justify-between gap-2 px-4 py-3 bg-[#0F3D2A] text-white sm:rounded-t-xl rounded-t-xl">
            <div className="flex items-center gap-2.5">
              <span className="relative">
                <Mascota tam={40} className={pensando ? 'asistente-pensando' : ''} />
                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-[#4ADE80] ring-2 ring-[#0F3D2A]" />
              </span>
              <div>
                <p className="text-sm font-semibold">Asistente de compras</p>
                <p className="text-[11px] text-white/70">{pensando ? 'Escribiendo…' : 'Te guío paso a paso en el uso de la app'}</p>
              </div>
            </div>
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => cambiarLetra(letra - 1)}
                disabled={letra === 0}
                className="text-white/80 hover:text-white disabled:opacity-40 px-1.5 text-xs font-semibold"
                title="Letra más pequeña"
                aria-label="Letra más pequeña"
              >
                A−
              </button>
              <button
                type="button"
                onClick={() => cambiarLetra(letra + 1)}
                disabled={letra === 2}
                className="text-white/80 hover:text-white disabled:opacity-40 px-1.5 text-sm font-semibold"
                title="Letra más grande"
                aria-label="Letra más grande"
              >
                A+
              </button>
              <button
                type="button"
                onClick={() => cambiarGrande(!grande)}
                className="text-white/80 hover:text-white px-1.5"
                title={grande ? 'Ventana normal' : 'Ampliar ventana'}
                aria-label={grande ? 'Ventana normal' : 'Ampliar ventana'}
              >
                {grande ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </button>
              {mensajes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMensajes([]);
                    setError(null);
                  }}
                  className="text-white/80 hover:text-white px-1.5"
                  title="Nueva conversación"
                  aria-label="Nueva conversación"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                  </svg>
                </button>
              )}
              <button type="button" onClick={() => setAbierto(false)} className="text-white/80 hover:text-white text-xl leading-none px-1" aria-label="Cerrar">
                ×
              </button>
            </div>
          </div>

          <div className={`flex-1 overflow-y-auto px-3 py-3 space-y-3 ${['text-sm', 'text-base', 'text-lg'][letra]}`}>
            {mensajes.length === 0 && (
              <div className="space-y-3">
                <div className="flex flex-col items-center text-center pt-2">
                  <Mascota tam={96} className="asistente-flotar shadow-md" />
                  <p className="mt-2 text-grafito">
                    ¡Hola{primerNombre ? ` ${primerNombre}` : ''}! 👋 Soy tu asistente de compras.
                    <br />
                    Pregúntame cómo hacer cualquier cosa en la app y te guío paso a paso.
                  </p>
                </div>
                <div>
                  <p className="text-[11px] font-medium text-slate mb-1">Visitas guiadas por la app</p>
                  <div className="flex flex-wrap gap-1.5">
                    {visitasParaRol(rol).map((v) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => iniciarVisita(v.id)}
                        className="text-xs rounded-full px-3 py-1.5 bg-[#0F3D2A] text-white hover:bg-black"
                      >
                        ▶ {v.titulo}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] font-medium text-slate -mb-1">O pregúntame</p>
                <div className="flex flex-col gap-1.5">
                  {(SUGERENCIAS[rol] || SUGERENCIAS.usuario).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => enviar(s)}
                      className="text-left text-xs border border-borde rounded-full px-3 py-1.5 text-marca hover:bg-marcaClaro"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {mensajes.map((m, k) =>
              m.rol === 'user' ? (
                <div key={k} className="flex flex-col items-end gap-1">
                  {((m.fotos && m.fotos.length > 0) || (m.pdfs && m.pdfs.length > 0)) && (
                    <div className="flex flex-wrap justify-end gap-1 max-w-[85%]">
                      {(m.fotos || []).map((f, j) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={j} src={f} alt="Foto adjunta" className="w-20 h-20 object-cover rounded-lg border border-borde" />
                      ))}
                      {(m.pdfs || []).map((n, j) => (
                        <span key={j} className="inline-flex items-center gap-1 text-xs bg-fondo border border-borde rounded-lg px-2 py-1 text-grafito">
                          📄 {n}
                        </span>
                      ))}
                    </div>
                  )}
                  {m.texto && <div className="max-w-[85%] bg-marca text-white rounded-lg rounded-br-sm px-3 py-2 whitespace-pre-line">{m.texto}</div>}
                </div>
              ) : (
                <div key={k} className="max-w-[94%] flex items-start gap-2 asistente-aparecer">
                  <Mascota tam={28} className="shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                  <div className="bg-fondo text-grafito rounded-lg rounded-bl-sm px-3 py-2">
                    <Contenido texto={m.texto} onIr={() => (window.innerWidth < 640 ? setAbierto(false) : undefined)} onVisita={iniciarVisita} />
                    {(m.acciones || []).map((a, j) => (a.tipo === 'carrito' ? <PropuestaCarrito key={j} items={a.items} /> : null))}
                  </div>
                  {m.id && (
                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-slate">
                      {m.valoracion ? (
                        <span>{m.valoracion === 1 ? '¡Gracias!' : 'Gracias, lo revisaremos.'}</span>
                      ) : (
                        <>
                          <span>¿Te ha ayudado?</span>
                          <button type="button" onClick={() => valorar(k, 1)} className="px-1 hover:scale-110" aria-label="Sí">
                            👍
                          </button>
                          <button type="button" onClick={() => valorar(k, -1)} className="px-1 hover:scale-110" aria-label="No">
                            👎
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  </div>
                </div>
              )
            )}
            {pensando && (
              <div className="flex items-center gap-2">
                <Mascota tam={28} className="asistente-pensando" />
                {leyendo && <span className="text-xs text-slate">Leyendo el adjunto… (puede tardar hasta un minuto)</span>}
                <span className="inline-flex gap-1 bg-fondo rounded-lg px-3 py-2.5 text-slate">
                  <span className="asistente-punto" />
                  <span className="asistente-punto" style={{ animationDelay: '.15s' }} />
                  <span className="asistente-punto" style={{ animationDelay: '.3s' }} />
                </span>
              </div>
            )}
            {error && <div className="text-xs text-rojo bg-[#F6E9E9] rounded-md px-3 py-2">{error}</div>}
            <div ref={finRef} />
          </div>

          {adjuntos.length > 0 && (
            <div className="border-t border-borde px-2 pt-2 flex flex-wrap gap-1.5">
              {adjuntos.map((a, j) => (
                <span key={j} className="inline-flex items-center gap-1 text-xs bg-fondo border border-borde rounded-full pl-2 pr-1 py-0.5 text-grafito max-w-[12rem]">
                  <span className="truncate">{a.type === 'application/pdf' ? '📄' : '🖼️'} {a.name}</span>
                  <button
                    type="button"
                    onClick={() => setAdjuntos((prev) => prev.filter((_, i) => i !== j))}
                    className="text-slate hover:text-rojo px-1 leading-none"
                    aria-label="Quitar adjunto"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="border-t border-borde p-2 flex items-end gap-2">
            <input
              ref={archivoRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={(e) => {
                elegirAdjuntos(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => archivoRef.current?.click()}
              disabled={pensando || adjuntos.length >= MAX_ADJUNTOS}
              className="shrink-0 w-9 h-9 inline-flex items-center justify-center rounded-md border border-borde text-slate hover:text-marca hover:border-marca disabled:opacity-50"
              title="Adjuntar foto o PDF (lista de materiales o foto del material)"
              aria-label="Adjuntar foto o PDF"
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
            </button>
            <textarea
              ref={inputRef}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                } else if (e.key === 'Escape') setAbierto(false);
              }}
              rows={1}
              maxLength={1500}
              placeholder={adjuntos.length ? 'Añade un comentario (opcional)…' : 'Escribe tu pregunta…'}
              className={`input flex-1 resize-none max-h-28 ${['text-sm', 'text-base', 'text-lg'][letra]}`}
            />
            <button
              type="button"
              onClick={() => enviar()}
              disabled={(!texto.trim() && adjuntos.length === 0) || pensando}
              className="btn-primary px-3 py-2 disabled:opacity-60"
              aria-label="Enviar"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
