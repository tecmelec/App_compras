'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { marcarNotificacionLeida, marcarTodasNotificacionesLeidas } from '@/app/actions/notificaciones';

type Notificacion = {
  id: string;
  pedido_id: string;
  numero_app: string | null;
  mensaje: string;
  leido: boolean;
  created_at: string;
};

function tiempoRelativo(fecha: string): string {
  const diffMs = Date.now() - new Date(fecha).getTime();
  const minutos = Math.floor(diffMs / 60000);
  if (minutos < 1) return 'ahora mismo';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} d`;
}

export default function NotificacionesIcon({ userId }: { userId: string }) {
  const [abierto, setAbierto] = useState(false);
  const [noLeidas, setNoLeidas] = useState(0);
  const [notificaciones, setNotificaciones] = useState<Notificacion[]>([]);
  const [cargado, setCargado] = useState(false);
  const abiertoRef = useRef(false);
  const router = useRouter();
  const supabase = createClient();

  abiertoRef.current = abierto;

  useEffect(() => {
    let activo = true;

    async function cargarConteo() {
      const { count } = await supabase
        .from('notificaciones')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', userId)
        .eq('leido', false);
      if (activo) setNoLeidas(count || 0);
    }
    cargarConteo();

    const canal = supabase
      .channel(`notificaciones-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `usuario_id=eq.${userId}` },
        (payload) => {
          setNoLeidas((n) => n + 1);
          if (abiertoRef.current) {
            setNotificaciones((prev) => [payload.new as Notificacion, ...prev].slice(0, 20));
          }
        }
      )
      .subscribe();

    return () => {
      activo = false;
      supabase.removeChannel(canal);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function cargarLista() {
    const { data } = await supabase
      .from('notificaciones')
      .select('id, pedido_id, numero_app, mensaje, leido, created_at')
      .eq('usuario_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    setNotificaciones(data || []);
    setCargado(true);
  }

  function alternar() {
    const nuevoEstado = !abierto;
    setAbierto(nuevoEstado);
    if (nuevoEstado && !cargado) cargarLista();
  }

  async function abrirNotificacion(n: Notificacion) {
    setAbierto(false);
    if (!n.leido) {
      setNoLeidas((v) => Math.max(0, v - 1));
      setNotificaciones((prev) => prev.map((x) => (x.id === n.id ? { ...x, leido: true } : x)));
      marcarNotificacionLeida(n.id);
    }
    router.push(`/mis-pedidos/${n.pedido_id}`);
  }

  async function marcarTodas() {
    setNoLeidas(0);
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leido: true })));
    await marcarTodasNotificacionesLeidas();
  }

  return (
    <div className="relative">
      <button
        onClick={alternar}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full hover:bg-fondo transition-colors"
        aria-label="Notificaciones"
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#1C2126"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {noLeidas > 0 && (
          <span className="absolute -top-1 -right-1 bg-rojo text-white text-xs font-semibold rounded-full min-w-[1.25rem] h-5 px-1 flex items-center justify-center border-2 border-white">
            {noLeidas > 99 ? '99+' : noLeidas}
          </span>
        )}
      </button>

      {abierto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAbierto(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-white border border-borde rounded-lg shadow-lg z-40 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-borde">
              <p className="text-sm font-medium text-grafito">Notificaciones</p>
              {noLeidas > 0 && (
                <button onClick={marcarTodas} className="text-xs text-marca hover:underline">
                  Marcar todas como leídas
                </button>
              )}
            </div>

            <div className="max-h-96 overflow-y-auto">
              {notificaciones.length === 0 ? (
                <p className="text-sm text-slate text-center py-8 px-4">
                  Todavía no tienes notificaciones. Activa &quot;Seguir pedido&quot; en una solicitud para
                  recibir avisos cuando cambie de estado.
                </p>
              ) : (
                notificaciones.map((n) => (
                  <button
                    key={n.id}
                    onClick={() => abrirNotificacion(n)}
                    className={`w-full text-left px-4 py-3 border-b border-borde last:border-b-0 hover:bg-fondo flex gap-2 ${
                      n.leido ? '' : 'bg-marcaClaro/40'
                    }`}
                  >
                    {!n.leido && <span className="w-2 h-2 rounded-full bg-marca mt-1.5 shrink-0" />}
                    <span className={n.leido ? 'ml-4' : ''}>
                      <span className="block text-sm text-grafito">{n.mensaje}</span>
                      <span className="block text-xs text-slate mt-0.5">{tiempoRelativo(n.created_at)}</span>
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
