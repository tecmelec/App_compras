'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { preguntarAsistente, valorarRespuestaAsistente, type MensajeAsistente } from '@/app/actions/asistente';
import { visitasParaRol } from '@/lib/asistente/visitas';

// Asistente de la app (fase 1). Se abre con el botón flotante "?" o desde el recuadro
// "¿Necesitas ayuda?" del menú (evento "abrir-asistente").
type Msg = MensajeAsistente & { id?: string | null; valoracion?: 1 | -1 };

const SUGERENCIAS: Record<string, string[]> = {
  usuario: ['Quiero hacer una solicitud de material', 'No encuentro un artículo en la tienda', '¿Cómo sé cuándo llega mi material?'],
  responsable: ['Quiero hacer una solicitud de material', '¿Cómo apruebo una solicitud?', '¿Cómo asigno proyectos a mi equipo?'],
  comprador: ['¿Cómo tramito una solicitud?', '¿Cómo pido ofertas a varios proveedores?', '¿Cómo envío el pedido al proveedor?'],
  admin: ['Quiero hacer una solicitud de material', '¿Cómo apruebo una solicitud?', '¿Cómo tramito una solicitud?'],
};

// Burbuja de la mascota según la pantalla (al pulsarla abre el chat con esa pregunta).
function pistaParaRuta(ruta: string, rol: string): { texto: string; pregunta: string } {
  if (ruta.startsWith('/carrito/foto')) return { texto: '¿Te explico cómo crear el carrito con una foto?', pregunta: '¿Cómo creo el carrito desde una foto?' };
  if (ruta.startsWith('/carrito')) return { texto: '¿Te ayudo a enviar la solicitud?', pregunta: '¿Cómo envío la solicitud de material?' };
  if (ruta.startsWith('/tienda')) return { texto: '¿Buscas algún material? Te ayudo', pregunta: 'Quiero hacer una solicitud de material' };
  if (ruta.startsWith('/lineas-compras')) return { texto: '¿Te explico qué significa cada columna?', pregunta: '¿Qué significa cada columna de Líns. compras?' };
  if (ruta.startsWith('/mis-pedidos')) return { texto: '¿Quieres saber cómo va tu solicitud?', pregunta: '¿Cómo sé cuándo llega mi material?' };
  if (ruta.startsWith('/responsable') && rol !== 'usuario') return { texto: '¿Te explico cómo aprobar?', pregunta: '¿Cómo apruebo una solicitud?' };
  if (ruta.startsWith('/comprador') && (rol === 'comprador' || rol === 'admin'))
    return { texto: '¿Te ayudo a tramitar la solicitud?', pregunta: '¿Cómo tramito una solicitud?' };
  return { texto: '¡Hola! ¿Te ayudo con algo?', pregunta: '' };
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
  const lineas = texto.split('\n');
  return (
    <div className="space-y-1">
      {lineas.map((linea, i) => {
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
  const [error, setError] = useState<string | null>(null);
  const finRef = useRef<HTMLDivElement>(null);
  const [burbuja, setBurbuja] = useState(false);
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
    if (!t || pensando) return;
    const nuevos: Msg[] = [...mensajes, { rol: 'user', texto: t }];
    setMensajes(nuevos);
    setTexto('');
    setError(null);
    setPensando(true);
    const r = await preguntarAsistente(
      nuevos.map(({ rol, texto }) => ({ rol, texto })),
      ruta || ''
    );
    setPensando(false);
    if ('error' in r && r.error) {
      setError(r.error);
      return;
    }
    const d = r as { respuesta: string; id: string | null };
    setMensajes((prev) => [...prev, { rol: 'assistant', texto: d.respuesta, id: d.id }]);
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
        <div className="fixed z-50 inset-x-0 bottom-0 sm:inset-auto sm:bottom-4 sm:right-4 sm:w-[380px] h-[75vh] sm:h-[560px] bg-white sm:rounded-xl rounded-t-xl shadow-2xl border border-borde flex flex-col print:hidden">
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
            <div className="flex items-center gap-1">
              {mensajes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setMensajes([]);
                    setError(null);
                  }}
                  className="text-[11px] text-white/80 hover:text-white px-2"
                  title="Empezar de nuevo"
                >
                  Nueva conversación
                </button>
              )}
              <button type="button" onClick={() => setAbierto(false)} className="text-white/80 hover:text-white text-xl leading-none px-1" aria-label="Cerrar">
                ×
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3 text-sm">
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
                <div key={k} className="flex justify-end">
                  <div className="max-w-[85%] bg-marca text-white rounded-lg rounded-br-sm px-3 py-2 whitespace-pre-line">{m.texto}</div>
                </div>
              ) : (
                <div key={k} className="max-w-[94%] flex items-start gap-2 asistente-aparecer">
                  <Mascota tam={28} className="shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                  <div className="bg-fondo text-grafito rounded-lg rounded-bl-sm px-3 py-2">
                    <Contenido texto={m.texto} onIr={() => (window.innerWidth < 640 ? setAbierto(false) : undefined)} onVisita={iniciarVisita} />
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

          <div className="border-t border-borde p-2 flex items-end gap-2">
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
              placeholder="Escribe tu pregunta…"
              className="input flex-1 text-sm resize-none max-h-28"
            />
            <button
              type="button"
              onClick={() => enviar()}
              disabled={!texto.trim() || pensando}
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
